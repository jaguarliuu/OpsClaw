import type {
  GroupRecord,
  NodeSummaryRecord,
} from './api';
import { mapNodeToProfile } from './workbenchPageModel';

type LoadWorkspaceDataOptions = {
  fetchNodes: () => Promise<NodeSummaryRecord[]>;
  fetchGroups: () => Promise<GroupRecord[]>;
};

type PingAllResult = Record<string, { online: boolean; latencyMs?: number }>;

export async function loadWorkspaceData(options: LoadWorkspaceDataOptions) {
  const [nodes, groups] = await Promise.all([
    options.fetchNodes(),
    options.fetchGroups(),
  ]);

  return {
    groups,
    profiles: nodes.map(mapNodeToProfile),
  };
}

export function buildNodeOnlineStatus(results: PingAllResult) {
  return Object.fromEntries(
    Object.entries(results).map(([id, result]) => [id, result.online])
  );
}

export function getWorkspaceDataErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '节点加载失败。';
}
