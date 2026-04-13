import type { InteractionRequest } from './types.agent.js';

type BaseApprovalRequest = {
  nodeId: string;
  openedAt?: number;
};

export type SftpApprovalRequestInput =
  | (BaseApprovalRequest & {
      kind: 'overwrite_upload';
      remotePath: string;
      localPath: string;
    })
  | (BaseApprovalRequest & {
      kind: 'batch_delete';
      remotePaths: string[];
    })
  | (BaseApprovalRequest & {
      kind: 'chmod';
      remotePath: string;
      nextPermissions: string;
    });

function buildRequestId(input: SftpApprovalRequestInput, openedAt: number) {
  if (input.kind === 'overwrite_upload') {
    return `sftp-approval:${input.kind}:${input.nodeId}:${input.remotePath}:${openedAt}`;
  }

  if (input.kind === 'batch_delete') {
    return `sftp-approval:${input.kind}:${input.nodeId}:${input.remotePaths.join('|')}:${openedAt}`;
  }

  return `sftp-approval:${input.kind}:${input.nodeId}:${input.remotePath}:${openedAt}`;
}

function buildOverwriteUploadRequest(
  input: Extract<SftpApprovalRequestInput, { kind: 'overwrite_upload' }>,
  openedAt: number
): InteractionRequest {
  const fileName = input.remotePath.split('/').filter(Boolean).pop() ?? input.remotePath;

  return {
    id: buildRequestId(input, openedAt),
    runId: `sftp-local:${input.nodeId}`,
    sessionId: `sftp-local:${input.nodeId}`,
    status: 'open',
    interactionKind: 'approval',
    riskLevel: 'high',
    blockingMode: 'hard_block',
    title: '覆盖远端文件',
    message: `远端已存在同名条目「${fileName}」，确认后才会继续覆盖上传。`,
    schemaVersion: 'v1',
    fields: [
      { type: 'display', key: 'remotePath', label: '远端路径', value: input.remotePath },
      { type: 'display', key: 'localPath', label: '本地文件', value: input.localPath },
    ],
    actions: [
      { id: 'approve', label: '确认覆盖', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消上传', kind: 'reject', style: 'secondary' },
    ],
    openedAt,
    deadlineAt: null,
    metadata: {
      source: 'sftp_action_gate',
      kind: input.kind,
      nodeId: input.nodeId,
      remotePath: input.remotePath,
      localPath: input.localPath,
    },
  };
}

function buildBatchDeleteRequest(
  input: Extract<SftpApprovalRequestInput, { kind: 'batch_delete' }>,
  openedAt: number
): InteractionRequest {
  return {
    id: buildRequestId(input, openedAt),
    runId: `sftp-local:${input.nodeId}`,
    sessionId: `sftp-local:${input.nodeId}`,
    status: 'open',
    interactionKind: 'approval',
    riskLevel: 'critical',
    blockingMode: 'hard_block',
    title: '批量删除远端条目',
    message: `即将删除 ${input.remotePaths.length} 个远端条目。确认后才会继续。`,
    schemaVersion: 'v1',
    fields: [
      {
        type: 'display',
        key: 'items',
        label: '待删除条目',
        value: input.remotePaths.join('\n'),
      },
    ],
    actions: [
      { id: 'approve', label: '确认删除', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '保留这些条目', kind: 'reject', style: 'secondary' },
    ],
    openedAt,
    deadlineAt: null,
    metadata: {
      source: 'sftp_action_gate',
      kind: input.kind,
      nodeId: input.nodeId,
      remotePaths: [...input.remotePaths],
    },
  };
}

function buildChmodRequest(
  input: Extract<SftpApprovalRequestInput, { kind: 'chmod' }>,
  openedAt: number
): InteractionRequest {
  return {
    id: buildRequestId(input, openedAt),
    runId: `sftp-local:${input.nodeId}`,
    sessionId: `sftp-local:${input.nodeId}`,
    status: 'open',
    interactionKind: 'approval',
    riskLevel: 'high',
    blockingMode: 'hard_block',
    title: '修改远端权限',
    message: `确认后才会继续将远端权限改为 ${input.nextPermissions}。`,
    schemaVersion: 'v1',
    fields: [
      { type: 'display', key: 'remotePath', label: '远端路径', value: input.remotePath },
      { type: 'display', key: 'nextPermissions', label: '目标权限', value: input.nextPermissions },
    ],
    actions: [
      { id: 'approve', label: '确认修改', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消修改', kind: 'reject', style: 'secondary' },
    ],
    openedAt,
    deadlineAt: null,
    metadata: {
      source: 'sftp_action_gate',
      kind: input.kind,
      nodeId: input.nodeId,
      remotePath: input.remotePath,
      nextPermissions: input.nextPermissions,
    },
  };
}

export function buildSftpApprovalRequest(input: SftpApprovalRequestInput): InteractionRequest {
  const openedAt = input.openedAt ?? Date.now();

  if (input.kind === 'overwrite_upload') {
    return buildOverwriteUploadRequest(input, openedAt);
  }

  if (input.kind === 'batch_delete') {
    return buildBatchDeleteRequest(input, openedAt);
  }

  return buildChmodRequest(input, openedAt);
}
