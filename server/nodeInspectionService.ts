import {
  DEFAULT_NODE_INSPECTION_SCRIPT,
  isLegacyDefaultNodeInspectionScriptContent,
} from './nodeInspectionScript.js';
import type { NodeInspectionProfile, NodeInspectionSnapshot } from './nodeInspectionStore.js';
import type { StoredNodeDetail, StoredNodeWithSecrets } from './nodeStore.js';
import type { ScriptLibraryItem } from './scriptLibraryStore.js';

export class NodeInspectionServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'NodeInspectionServiceError';
  }
}

type DashboardSummary = {
  cpuUsagePercent?: number | null;
  memoryUsagePercent?: number | null;
  rootDiskUsagePercent?: number | null;
  load1?: number | null;
};

export type NodeDashboardSnapshot = NodeInspectionSnapshot & {
  summaryJson: DashboardSummary | null;
};

export type NodeDashboardPayload = {
  node: Pick<StoredNodeDetail, 'id' | 'name' | 'host' | 'username'>;
  profile: NodeInspectionProfile | null;
  latestSnapshot: NodeDashboardSnapshot | null;
  latestSuccessSnapshot: NodeDashboardSnapshot | null;
  recentSnapshots: NodeDashboardSnapshot[];
};

type InspectionStore = {
  getProfile: (nodeId: string) => NodeInspectionProfile | null;
  upsertProfile: (input: {
    nodeId: string;
    scriptId: string;
    dashboardSchemaKey: string;
  }) => NodeInspectionProfile;
  createSnapshot: (input: {
    nodeId: string;
    status: 'success' | 'error';
    payloadJson: string | null;
    errorMessage: string | null;
  }) => NodeInspectionSnapshot;
  listSnapshots: (nodeId: string) => NodeInspectionSnapshot[];
  getLatestSuccessSnapshot: (nodeId: string) => NodeInspectionSnapshot | null;
  deleteNodeInspectionData: (nodeId: string) => void;
};

type ScriptLibraryStore = {
  getScript: (id: string) => ScriptLibraryItem | null;
  listManagedScripts: (input?: {
    scope?: 'global' | 'node';
    nodeId?: string;
    usage?: 'quick_run' | 'inspection';
  }) => ScriptLibraryItem[];
  createScript: (input: {
    key: string;
    alias: string;
    scope: 'global' | 'node';
    nodeId: string | null;
    title: string;
    description?: string;
    kind: 'plain' | 'template';
    usage?: 'quick_run' | 'inspection';
    content: string;
    variables: [];
    tags: string[];
  }) => ScriptLibraryItem;
  updateScript: (id: string, input: {
    key?: string;
    alias?: string;
    title?: string;
    description?: string;
    kind?: 'plain' | 'template';
    usage?: 'quick_run' | 'inspection';
    content?: string;
    variables?: [];
    tags?: string[];
  }) => ScriptLibraryItem | null;
  deleteScript: (id: string) => void;
};

type NodeStore = {
  getNode: (id: string) => StoredNodeDetail | null;
  getNodeWithSecrets: (id: string) => StoredNodeWithSecrets | null;
};

export type RunInspectionCommand = (
  node: StoredNodeWithSecrets,
  command: string
) => Promise<string>;

function coerceFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function buildSummary(payloadJson: string | null): DashboardSummary | null {
  if (!payloadJson) {
    return null;
  }

  const parsed = readRecord(JSON.parse(payloadJson));
  if (!parsed) {
    return null;
  }

  const cpu = readRecord(parsed.cpu);
  const memory = readRecord(parsed.memory);
  const disk = readRecord(parsed.disk);
  const load = readRecord(parsed.load);

  const summary: DashboardSummary = {
    cpuUsagePercent: coerceFiniteNumber(cpu?.usagePercent),
    memoryUsagePercent: coerceFiniteNumber(memory?.usagePercent),
    rootDiskUsagePercent:
      coerceFiniteNumber(disk?.rootUsagePercent) ?? coerceFiniteNumber(disk?.usagePercent),
    load1: coerceFiniteNumber(load?.load1),
  };

  if (
    summary.cpuUsagePercent === null &&
    summary.memoryUsagePercent === null &&
    summary.rootDiskUsagePercent === null &&
    summary.load1 === null
  ) {
    return null;
  }

  return summary;
}

function hydrateSnapshot(snapshot: NodeInspectionSnapshot | null): NodeDashboardSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    summaryJson: buildSummary(snapshot.payloadJson),
  };
}

export function createNodeInspectionService(dependencies: {
  nodeStore: NodeStore;
  scriptLibraryStore: ScriptLibraryStore;
  inspectionStore: InspectionStore;
  runInspectionCommand: RunInspectionCommand;
}) {
  const { nodeStore, scriptLibraryStore, inspectionStore, runInspectionCommand } = dependencies;

  function requireNode(nodeId: string) {
    const node = nodeStore.getNode(nodeId);
    if (!node) {
      throw new NodeInspectionServiceError(404, '节点不存在。');
    }

    return node;
  }

  function createDefaultInspectionScript(nodeId: string) {
    return scriptLibraryStore.createScript({
      key: DEFAULT_NODE_INSPECTION_SCRIPT.key,
      alias: DEFAULT_NODE_INSPECTION_SCRIPT.alias,
      scope: 'node',
      nodeId,
      title: '节点默认巡检',
      description: '为节点状态 dashboard 提供标准 JSON 数据。',
      kind: 'plain',
      usage: 'inspection',
      content: DEFAULT_NODE_INSPECTION_SCRIPT.content,
      variables: [],
      tags: ['dashboard', 'inspection'],
    });
  }

  function upgradeLegacyDefaultInspectionScript(script: ScriptLibraryItem) {
    if (!isLegacyDefaultNodeInspectionScriptContent(script.content)) {
      return script;
    }

    return (
      scriptLibraryStore.updateScript(script.id, {
        content: DEFAULT_NODE_INSPECTION_SCRIPT.content,
      }) ?? script
    );
  }

  function ensureDefaultInspectionProfile(nodeId: string) {
    requireNode(nodeId);

    const currentProfile = inspectionStore.getProfile(nodeId);
    const currentScript = currentProfile ? scriptLibraryStore.getScript(currentProfile.scriptId) : null;
    if (currentProfile && currentScript) {
      upgradeLegacyDefaultInspectionScript(currentScript);
      return currentProfile;
    }

    const script = currentProfile
      ? createDefaultInspectionScript(nodeId)
      : upgradeLegacyDefaultInspectionScript(
          scriptLibraryStore.listManagedScripts({
            scope: 'node',
            nodeId,
            usage: 'inspection',
          })[0] ?? createDefaultInspectionScript(nodeId)
        );

    return inspectionStore.upsertProfile({
      nodeId,
      scriptId: script.id,
      dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
    });
  }

  function ensureNodeBootstrap(nodeId: string) {
    return ensureDefaultInspectionProfile(nodeId);
  }

  function getNodeDashboard(nodeId: string): NodeDashboardPayload {
    const node = requireNode(nodeId);
    const profile = ensureDefaultInspectionProfile(nodeId);
    const recentSnapshots = inspectionStore.listSnapshots(nodeId).map((snapshot) => hydrateSnapshot(snapshot)!);

    return {
      node: {
        id: node.id,
        name: node.name,
        host: node.host,
        username: node.username,
      },
      profile,
      latestSnapshot: recentSnapshots[0] ?? null,
      latestSuccessSnapshot: hydrateSnapshot(inspectionStore.getLatestSuccessSnapshot(nodeId)),
      recentSnapshots,
    };
  }

  async function collectNodeDashboard(nodeId: string) {
    const node = nodeStore.getNodeWithSecrets(nodeId);
    if (!node) {
      throw new NodeInspectionServiceError(404, '节点不存在。');
    }

    const profile = ensureDefaultInspectionProfile(nodeId);
    const script = scriptLibraryStore.getScript(profile.scriptId);
    if (!script) {
      throw new NodeInspectionServiceError(500, '节点巡检脚本不存在。');
    }

    try {
      const stdout = await runInspectionCommand(node, script.content);
      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error('巡检脚本未返回 JSON。');
      }

      inspectionStore.createSnapshot({
        nodeId,
        status: 'success',
        payloadJson: JSON.stringify(JSON.parse(trimmed)),
        errorMessage: null,
      });
    } catch (error) {
      inspectionStore.createSnapshot({
        nodeId,
        status: 'error',
        payloadJson: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    return getNodeDashboard(nodeId);
  }

  function deleteNodeInspectionData(nodeId: string) {
    const inspectionScripts = scriptLibraryStore.listManagedScripts({
      scope: 'node',
      nodeId,
      usage: 'inspection',
    });
    for (const script of inspectionScripts) {
      scriptLibraryStore.deleteScript(script.id);
    }
    inspectionStore.deleteNodeInspectionData(nodeId);
  }

  return {
    ensureDefaultInspectionProfile,
    ensureNodeBootstrap,
    getNodeDashboard,
    collectNodeDashboard,
    deleteNodeInspectionData,
  };
}
