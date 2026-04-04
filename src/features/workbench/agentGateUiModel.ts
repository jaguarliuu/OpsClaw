import type { HumanGateRecord } from './types.agent';
import type { AgentSessionLock } from './types';

export function getHumanGatePrimaryActionLabel(gate: HumanGateRecord) {
  if (gate.kind === 'approval') {
    return '批准';
  }

  if (gate.kind === 'terminal_input' && gate.status === 'expired') {
    return '继续等待';
  }

  return null;
}

export function getHumanGateTitle(gate: HumanGateRecord) {
  if (gate.kind === 'approval') {
    return gate.status === 'rejected' ? '已拒绝敏感操作' : '等待人工审批';
  }

  if (gate.status === 'expired') {
    return '终端交互已暂停';
  }

  return '等待终端输入';
}

export function getHumanGateDescription(gate: HumanGateRecord) {
  if (gate.kind === 'approval') {
    return '该操作需要你的批准后才会继续执行。';
  }

  if (gate.status === 'expired') {
    return 'Agent 已暂停等待。你可以先在终端中完成输入，再回到这里继续等待。';
  }

  return '请在对应终端中完成交互输入。';
}

export function getAgentSessionLock(gate: HumanGateRecord | null): AgentSessionLock | null {
  if (
    gate === null ||
    gate.kind !== 'terminal_input' ||
    (gate.status !== 'open' && gate.status !== 'expired')
  ) {
    return null;
  }

  return {
    sessionId: gate.sessionId,
    runId: gate.runId,
    gateId: gate.id,
    status: gate.status,
    reason: gate.reason,
    command: gate.payload.command,
  };
}

export function getAgentSessionLockBannerText(lock: AgentSessionLock) {
  if (lock.status === 'expired') {
    return '该终端上的 Agent 交互等待已暂停，可在 AI 面板中继续等待。';
  }

  return '该终端正在被 Agent 用于交互命令，请在此完成输入。';
}

export function getHumanGateSecondaryActionLabel(gate: HumanGateRecord) {
  if (gate.kind === 'approval') {
    return '拒绝';
  }

  return null;
}
