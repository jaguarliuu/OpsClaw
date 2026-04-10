import type {
  NodeDashboardPayload,
  NodeDashboardSnapshot,
} from './types.js';

type DashboardSectionRow = {
  label: string;
  value: string;
};

export type NodeDashboardSummaryCard = {
  id: string;
  label: string;
  value: string;
};

export type NodeDashboardModule = {
  id: string;
  title: string;
  rows: DashboardSectionRow[];
};

export type NodeDashboardRecentSnapshotItem = {
  id: string;
  status: 'success' | 'error';
  statusLabel: string;
  createdAt: string;
  detail: string;
};

export type NodeDashboardViewModel = {
  activeSnapshot: NodeDashboardSnapshot | null;
  latestCollectedAt: string | null;
  summaryCards: NodeDashboardSummaryCard[];
  modules: NodeDashboardModule[];
  recentSnapshots: NodeDashboardRecentSnapshotItem[];
  warningMessage: string | null;
  isEmpty: boolean;
  isUnsupportedSchema: boolean;
};

export type NodeDashboardPresentationModel = {
  mode: 'loading' | 'error' | 'empty' | 'unsupported' | 'content';
  bannerMessage: string | null;
  bannerTone: 'warning' | 'error' | null;
  viewModel: NodeDashboardViewModel | null;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePayloadJson(snapshot: NodeDashboardSnapshot | null) {
  if (!snapshot?.payloadJson) {
    return null;
  }

  try {
    return readRecord(JSON.parse(snapshot.payloadJson));
  } catch {
    return null;
  }
}

function formatNumber(value: number, fractionDigits: number) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(fractionDigits, 1),
  });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '--';
  }

  return `${formatNumber(value, 1)}%`;
}

function formatLoad(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '--';
  }

  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value < 1 && !Number.isInteger(value) ? 2 : 0,
  });
}

function formatBytes(value: number | null) {
  if (value === null) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toLocaleString('en-US', {
    maximumFractionDigits: current >= 10 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function buildSummaryCards(snapshot: NodeDashboardSnapshot | null) {
  const summary = snapshot?.summaryJson;

  return [
    {
      id: 'cpu',
      label: 'CPU',
      value: formatPercent(summary?.cpuUsagePercent),
    },
    {
      id: 'memory',
      label: '内存',
      value: formatPercent(summary?.memoryUsagePercent),
    },
    {
      id: 'disk',
      label: '根分区',
      value: formatPercent(summary?.rootDiskUsagePercent),
    },
    {
      id: 'load1',
      label: 'Load 1',
      value: formatLoad(summary?.load1),
    },
  ];
}

function compactRows(
  rows: Array<readonly [label: string, value: string | number | null | undefined]>,
  options?: {
    formatValue?: (label: string, value: string | number) => string;
  }
) {
  return rows
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => ({
      label,
      value:
        options?.formatValue && (typeof value === 'string' || typeof value === 'number')
          ? options.formatValue(label, value)
          : String(value),
    }));
}

function buildModules(snapshot: NodeDashboardSnapshot | null): NodeDashboardModule[] {
  const payload = parsePayloadJson(snapshot);
  if (!payload) {
    return [];
  }

  const system = readRecord(payload.system);
  const cpu = readRecord(payload.cpu);
  const memory = readRecord(payload.memory);
  const disk = readRecord(payload.disk);
  const load = readRecord(payload.load);
  const services = readArray(payload.services);
  const filesystems = readArray(disk?.filesystems);

  const modules: NodeDashboardModule[] = [];

  modules.push({
    id: 'system',
    title: '系统',
    rows: compactRows([
      ['主机名', readString(system?.hostname)],
      ['平台', readString(system?.platform)],
      ['内核', readString(system?.kernel)],
      ['运行时长', readFiniteNumber(system?.uptimeSeconds)],
    ], {
      formatValue: (label, value) => (label === '运行时长' && typeof value === 'number' ? `${value}s` : String(value)),
    }),
  });

  modules.push({
    id: 'cpu',
    title: 'CPU',
    rows: compactRows([
      ['型号', readString(cpu?.model)],
      ['核心数', readFiniteNumber(cpu?.cores)],
      ['使用率', readFiniteNumber(cpu?.usagePercent)],
    ], {
      formatValue: (label, value) =>
        label === '使用率' && typeof value === 'number'
          ? formatPercent(value)
          : String(value),
    }),
  });

  modules.push({
    id: 'memory',
    title: '内存',
    rows: compactRows([
      ['使用率', readFiniteNumber(memory?.usagePercent)],
      ['总量', readFiniteNumber(memory?.totalBytes)],
      ['已用', readFiniteNumber(memory?.usedBytes)],
      ['可用', readFiniteNumber(memory?.availableBytes)],
    ], {
      formatValue: (label, value) =>
        label === '使用率' && typeof value === 'number'
          ? formatPercent(value)
          : typeof value === 'number'
            ? formatBytes(value)
            : String(value),
    }),
  });

  modules.push({
    id: 'disk',
    title: '磁盘',
    rows: filesystems
      .map((item) => readRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => ({
        label: readString(item.mount) ?? '挂载点',
        value: formatPercent(readFiniteNumber(item.usagePercent)),
      })),
  });

  modules.push({
    id: 'load',
    title: '负载',
    rows: compactRows([
      ['Load 1', readFiniteNumber(load?.load1)],
      ['Load 5', readFiniteNumber(load?.load5)],
      ['Load 15', readFiniteNumber(load?.load15)],
    ], {
      formatValue: (_label, value) => (typeof value === 'number' ? formatLoad(value) : String(value)),
    }),
  });

  modules.push({
    id: 'services',
    title: '服务',
    rows: services
      .map((item) => readRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item, index) => {
        const name = readString(item.name) ?? `service-${index + 1}`;
        const status = readString(item.status) ?? 'unknown';
        return {
          label: name,
          value: `${name}: ${status}`,
        };
      }),
  });

  return modules.filter((module) => module.rows.length > 0);
}

function buildRecentSnapshots(payload: NodeDashboardPayload): NodeDashboardRecentSnapshotItem[] {
  return payload.recentSnapshots.slice(0, 5).map((snapshot) => ({
    id: snapshot.id,
    status: snapshot.status,
    statusLabel: snapshot.status === 'success' ? '成功' : '失败',
    createdAt: snapshot.createdAt,
    detail:
      snapshot.status === 'success'
        ? [
            snapshot.summaryJson?.cpuUsagePercent !== null &&
            snapshot.summaryJson?.cpuUsagePercent !== undefined
              ? `CPU ${formatPercent(snapshot.summaryJson.cpuUsagePercent)}`
              : null,
            snapshot.summaryJson?.memoryUsagePercent !== null &&
            snapshot.summaryJson?.memoryUsagePercent !== undefined
              ? `内存 ${formatPercent(snapshot.summaryJson.memoryUsagePercent)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || '采集成功'
        : snapshot.errorMessage ?? '采集失败',
  }));
}

function getCollectedAt(snapshot: NodeDashboardSnapshot | null) {
  const payload = parsePayloadJson(snapshot);
  return readString(payload?.collectedAt) ?? snapshot?.createdAt ?? null;
}

export function buildNodeDashboardViewModel(payload: NodeDashboardPayload): NodeDashboardViewModel {
  const schemaKey = payload.profile?.dashboardSchemaKey ?? null;
  const latestSnapshotFailed = payload.latestSnapshot?.status === 'error';
  const activeSnapshot =
    payload.latestSnapshot?.status === 'success'
      ? payload.latestSnapshot
      : payload.latestSuccessSnapshot;

  return {
    activeSnapshot: activeSnapshot ?? null,
    latestCollectedAt: getCollectedAt(activeSnapshot ?? payload.latestSnapshot),
    summaryCards: buildSummaryCards(activeSnapshot),
    modules: schemaKey === 'default_system' ? buildModules(activeSnapshot) : [],
    recentSnapshots: buildRecentSnapshots(payload),
    warningMessage:
      latestSnapshotFailed && payload.latestSnapshot?.errorMessage
        ? `最近一次采集失败：${payload.latestSnapshot.errorMessage}`
        : null,
    isEmpty: activeSnapshot === null,
    isUnsupportedSchema: schemaKey !== null && schemaKey !== 'default_system',
  };
}

export function buildNodeDashboardPresentationModel(input: {
  payload: NodeDashboardPayload | null;
  errorMessage: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
}): NodeDashboardPresentationModel {
  if (input.payload === null) {
    if (input.isLoading) {
      return {
        mode: 'loading',
        bannerMessage: null,
        bannerTone: null,
        viewModel: null,
      };
    }

    if (input.errorMessage) {
      return {
        mode: 'error',
        bannerMessage: input.errorMessage,
        bannerTone: 'error',
        viewModel: null,
      };
    }

    return {
      mode: 'empty',
      bannerMessage: null,
      bannerTone: null,
      viewModel: null,
    };
  }

  const viewModel = buildNodeDashboardViewModel(input.payload);
  if (viewModel.isUnsupportedSchema) {
    return {
      mode: 'unsupported',
      bannerMessage: input.errorMessage,
      bannerTone: input.errorMessage ? 'error' : null,
      viewModel,
    };
  }

  const bannerMessage = input.errorMessage ?? viewModel.warningMessage;
  const bannerTone =
    input.errorMessage !== null ? 'error' : viewModel.warningMessage ? 'warning' : null;

  return {
    mode: viewModel.isEmpty ? 'empty' : 'content',
    bannerMessage,
    bannerTone,
    viewModel,
  };
}
