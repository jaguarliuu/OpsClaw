import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNodeDashboardPresentationModel,
  buildNodeDashboardViewModel,
} from './nodeDashboardModel.js';
import {
  buildOpenedNodeStatusDashboardState,
  shouldApplyNodeStatusDashboardResponse,
} from './useNodeStatusDashboard.js';

const dashboardPayload = {
  node: {
    id: 'node-1',
    name: 'prod-web-1',
    host: '10.0.0.8',
    username: 'root',
  },
  profile: {
    nodeId: 'node-1',
    scriptId: 'script-1',
    dashboardSchemaKey: 'default_system',
    createdAt: '2026-04-09T10:00:00.000Z',
    updatedAt: '2026-04-09T10:00:00.000Z',
  },
  latestSnapshot: {
    id: 'snapshot-2',
    nodeId: 'node-1',
    status: 'success' as const,
    payloadJson: JSON.stringify({
      schemaVersion: 1,
      collectedAt: '2026-04-09T11:00:00.000Z',
      system: {
        hostname: 'prod-web-1',
        platform: 'linux',
        kernel: '6.8.0',
        uptimeSeconds: 7265,
      },
      cpu: {
        model: 'AMD EPYC',
        cores: 8,
        usagePercent: 58.2,
      },
      memory: {
        totalBytes: 17179869184,
        usedBytes: 7516192768,
        usagePercent: 43.7,
      },
      disk: {
        rootTotalBytes: 53687091200,
        rootUsedBytes: 36238786560,
        rootUsagePercent: 67.5,
        filesystems: [
          {
            mount: '/',
            usagePercent: 67.5,
          },
        ],
      },
      load: {
        load1: 0.83,
        load5: 0.79,
        load15: 0.74,
      },
      services: [
        { name: 'nginx', status: 'active' },
        { name: 'sshd', status: 'active' },
      ],
    }),
    errorMessage: null,
    createdAt: '2026-04-09T11:00:00.000Z',
    createdAtMs: 1744196400000,
    summaryJson: {
      cpuUsagePercent: 58.2,
      memoryUsagePercent: 43.7,
      rootDiskUsagePercent: 67.5,
      load1: 0.83,
    },
  },
  latestSuccessSnapshot: {
    id: 'snapshot-2',
    nodeId: 'node-1',
    status: 'success' as const,
    payloadJson: JSON.stringify({
      schemaVersion: 1,
      collectedAt: '2026-04-09T11:00:00.000Z',
      system: {
        hostname: 'prod-web-1',
      },
      cpu: {
        usagePercent: 58.2,
      },
      memory: {
        usagePercent: 43.7,
      },
      disk: {
        rootUsagePercent: 67.5,
      },
      load: {
        load1: 0.83,
      },
    }),
    errorMessage: null,
    createdAt: '2026-04-09T11:00:00.000Z',
    createdAtMs: 1744196400000,
    summaryJson: {
      cpuUsagePercent: 58.2,
      memoryUsagePercent: 43.7,
      rootDiskUsagePercent: 67.5,
      load1: 0.83,
    },
  },
  recentSnapshots: [
    {
      id: 'snapshot-2',
      nodeId: 'node-1',
      status: 'success' as const,
      payloadJson: JSON.stringify({
        cpu: { usagePercent: 58.2 },
      }),
      errorMessage: null,
      createdAt: '2026-04-09T11:00:00.000Z',
      createdAtMs: 1744196400000,
      summaryJson: {
        cpuUsagePercent: 58.2,
        memoryUsagePercent: 43.7,
        rootDiskUsagePercent: 67.5,
        load1: 0.83,
      },
    },
    {
      id: 'snapshot-1',
      nodeId: 'node-1',
      status: 'error' as const,
      payloadJson: null,
      errorMessage: 'ssh timeout',
      createdAt: '2026-04-09T10:45:00.000Z',
      createdAtMs: 1744195500000,
      summaryJson: null,
    },
  ],
};

void test('buildNodeDashboardViewModel renders default_system summary cards modules and recent snapshots', () => {
  const result = buildNodeDashboardViewModel(dashboardPayload);

  assert.equal(result.activeSnapshot?.id, 'snapshot-2');
  assert.deepEqual(
    result.summaryCards.map((item) => [item.label, item.value]),
    [
      ['CPU', '58.2%'],
      ['内存', '43.7%'],
      ['根分区', '67.5%'],
      ['Load 1', '0.83'],
    ]
  );
  assert.deepEqual(
    result.modules.map((item) => item.title),
    ['系统', 'CPU', '内存', '磁盘', '负载', '服务']
  );
  assert.equal(result.modules.find((item) => item.id === 'services')?.rows[0]?.value, 'nginx: active');
  assert.equal(result.recentSnapshots[0]?.statusLabel, '成功');
  assert.match(result.recentSnapshots[1]?.detail ?? '', /ssh timeout/);
});

void test('buildNodeDashboardViewModel falls back to the latest successful snapshot when the latest collection failed', () => {
  const result = buildNodeDashboardViewModel({
    ...dashboardPayload,
    latestSnapshot: {
      id: 'snapshot-3',
      nodeId: 'node-1',
      status: 'error',
      payloadJson: null,
      errorMessage: 'permission denied',
      createdAt: '2026-04-09T11:30:00.000Z',
      createdAtMs: 1744198200000,
      summaryJson: null,
    },
  });

  assert.equal(result.activeSnapshot?.id, 'snapshot-2');
  assert.match(result.warningMessage ?? '', /permission denied/);
  assert.equal(result.summaryCards[0]?.value, '58.2%');
});

void test('buildNodeDashboardPresentationModel keeps content visible when payload and request error coexist', () => {
  const result = buildNodeDashboardPresentationModel({
    errorMessage: '采集失败。',
    isLoading: false,
    isRefreshing: false,
    payload: dashboardPayload,
  });

  assert.equal(result.mode, 'content');
  assert.equal(result.bannerTone, 'error');
  assert.match(result.bannerMessage ?? '', /采集失败/);
  assert.equal(result.viewModel?.summaryCards[0]?.value, '58.2%');
});

void test('buildNodeDashboardPresentationModel keeps empty mode for nodes without snapshots', () => {
  const result = buildNodeDashboardPresentationModel({
    errorMessage: null,
    isLoading: false,
    isRefreshing: false,
    payload: {
      ...dashboardPayload,
      latestSnapshot: null,
      latestSuccessSnapshot: null,
      recentSnapshots: [],
    },
  });

  assert.equal(result.mode, 'empty');
  assert.equal(result.bannerMessage, null);
  assert.equal(result.viewModel?.isEmpty, true);
});

void test('buildNodeDashboardPresentationModel marks unsupported schemas explicitly', () => {
  const result = buildNodeDashboardPresentationModel({
    errorMessage: null,
    isLoading: false,
    isRefreshing: false,
    payload: {
      ...dashboardPayload,
      profile: {
        ...dashboardPayload.profile,
        dashboardSchemaKey: 'custom_schema',
      },
    },
  });

  assert.equal(result.mode, 'unsupported');
  assert.equal(result.bannerMessage, null);
  assert.equal(result.viewModel?.isUnsupportedSchema, true);
});

void test('buildOpenedNodeStatusDashboardState clears stale payload when opening a new node', () => {
  const result = buildOpenedNodeStatusDashboardState({
    errorMessage: 'old error',
    nodeId: 'node-1',
    open: true,
    payload: dashboardPayload,
  }, 'node-2');

  assert.equal(result.nodeId, 'node-2');
  assert.equal(result.payload, null);
  assert.equal(result.errorMessage, null);
});

void test('shouldApplyNodeStatusDashboardResponse rejects stale request ids and outdated node ids', () => {
  assert.equal(
    shouldApplyNodeStatusDashboardResponse({
      activeNodeId: 'node-2',
      latestRequestId: 2,
      requestId: 1,
      requestedNodeId: 'node-1',
    }),
    false
  );

  assert.equal(
    shouldApplyNodeStatusDashboardResponse({
      activeNodeId: 'node-2',
      latestRequestId: 2,
      requestId: 2,
      requestedNodeId: 'node-1',
    }),
    false
  );

  assert.equal(
    shouldApplyNodeStatusDashboardResponse({
      activeNodeId: 'node-2',
      latestRequestId: 2,
      requestId: 2,
      requestedNodeId: 'node-2',
    }),
    true
  );
});
