import { randomUUID } from 'node:crypto';

import type { InteractionRequest } from './interactionTypes.js';
import type { InteractionSource } from './toolTypes.js';

function getApprovalInteractionMessage(input: {
  policy: { matches: Array<unknown> };
}) {
  return input.policy.matches.length > 0
    ? '命令命中敏感操作策略，需要用户审批后执行。'
    : '该操作需要用户审批后执行。';
}

export function createInteractionRequest(input: {
  runId: string;
  sessionId: string;
  source: InteractionSource;
}): InteractionRequest {
  const openedAt = Date.now();

  if (input.source.source === 'parameter_collection') {
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: 'collect_input',
      riskLevel: 'medium',
      blockingMode: 'soft_block',
      title: '补全关键参数',
      message: '继续执行前需要你确认或填写参数。',
      schemaVersion: 'v1',
      fields: input.source.context.fields.map((field) => ({
        type: field.name === 'password' ? 'password' as const : 'text' as const,
        key: field.name,
        label: field.label,
        required: field.required,
        value: field.value,
      })),
      actions: [
        { id: 'submit', label: '提交并继续', kind: 'submit', style: 'primary' },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt,
      deadlineAt: null,
      metadata: {
        source: input.source.source,
        intentKind: input.source.context.intentKind,
        commandPreview: input.source.context.command,
      },
    };
  }

  if (input.source.source === 'policy_approval') {
    const message = getApprovalInteractionMessage({
      policy: input.source.context.policy,
    });
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message,
      schemaVersion: 'v1',
      fields: [],
      actions: [
        { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt,
      deadlineAt: null,
      metadata: {
        source: input.source.source,
        commandPreview:
          typeof input.source.context.arguments.command === 'string'
            ? input.source.context.arguments.command
            : undefined,
        policyAction: input.source.context.policy.action,
        policyMatches: input.source.context.policy.matches,
      },
    };
  }

  if (input.source.source === 'danger_confirmation') {
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: 'danger_confirm',
      riskLevel: 'critical',
      blockingMode: 'hard_block',
      title: input.source.context.title,
      message: input.source.context.message,
      schemaVersion: 'v1',
      fields: input.source.context.commandPreview
        ? [{ type: 'display', key: 'commandPreview', label: '命令', value: input.source.context.commandPreview }]
        : [],
      actions: [
        {
          id: 'approve',
          label: input.source.context.confirmLabel,
          kind: 'approve',
          style: 'danger',
        },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt,
      deadlineAt: null,
      metadata: {
        source: input.source.source,
        commandPreview: input.source.context.commandPreview,
      },
    };
  }

  if (input.source.source === 'terminal_wait') {
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: 'terminal_wait',
      riskLevel: 'medium',
      blockingMode: 'hard_block',
      title: '等待终端交互',
      message: '命令正在等待你在终端中继续输入。',
      schemaVersion: 'v1',
      fields: [
        { type: 'display', key: 'command', label: '命令', value: input.source.context.command },
        ...(input.source.context.sessionLabel
          ? [{ type: 'display' as const, key: 'sessionLabel', label: '会话', value: input.source.context.sessionLabel }]
          : []),
      ],
      actions: [
        {
          id: 'continue_waiting',
          label: '继续等待',
          kind: 'continue_waiting',
          style: 'primary',
        },
        {
          id: 'cancel',
          label: '取消等待',
          kind: 'cancel',
          style: 'secondary',
        },
      ],
      openedAt,
      deadlineAt: openedAt + input.source.context.timeoutMs,
      metadata: {
        source: input.source.source,
        timeoutMs: input.source.context.timeoutMs,
        commandPreview: input.source.context.command,
        sessionLabel: input.source.context.sessionLabel,
      },
    };
  }

  if (input.source.source === 'user_interaction') {
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: input.source.context.interactionKind,
      riskLevel: input.source.context.riskLevel,
      blockingMode: input.source.context.blockingMode,
      title: input.source.context.title,
      message: input.source.context.message,
      schemaVersion: 'v1',
      fields: input.source.context.fields,
      actions: input.source.context.actions,
      openedAt,
      deadlineAt: null,
      metadata: {
        source: input.source.source,
        ...(input.source.context.metadata ?? {}),
      },
    };
  }

  return {
    id: randomUUID(),
    runId: input.runId,
    sessionId: input.sessionId,
    status: 'open',
    interactionKind: 'inform',
    riskLevel: 'low',
    blockingMode: 'soft_block',
    title: input.source.context.title,
    message: input.source.context.message,
    schemaVersion: 'v1',
    fields: [],
    actions: [{ id: 'acknowledge', label: '知道了', kind: 'acknowledge', style: 'primary' }],
    openedAt,
    deadlineAt: null,
    metadata: {
      source: input.source.source,
    },
  };
}
