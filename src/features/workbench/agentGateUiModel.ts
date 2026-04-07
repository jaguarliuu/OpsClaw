import type { HumanGateRecord } from './types.agent';

export function getHumanGatePrimaryActionLabel(gate: HumanGateRecord) {
  if (gate.kind === 'parameter_confirmation') {
    return '确认参数';
  }

  if (gate.kind === 'approval') {
    return '批准';
  }

  if (gate.kind === 'terminal_input' && gate.status === 'expired') {
    return '继续等待';
  }

  return null;
}

export function getHumanGateTitle(gate: HumanGateRecord) {
  if (gate.kind === 'parameter_confirmation') {
    return gate.status === 'rejected' ? '已拒绝参数确认' : '等待参数确认';
  }

  if (gate.kind === 'approval') {
    return gate.status === 'rejected' ? '已拒绝敏感操作' : '等待人工审批';
  }

  if (gate.status === 'expired') {
    return '终端交互已暂停';
  }

  return '等待终端输入';
}

export function getHumanGateDescription(gate: HumanGateRecord) {
  if (gate.kind === 'parameter_confirmation') {
    return '请确认或补全关键参数，确认后才会继续执行命令。';
  }

  if (gate.kind === 'approval') {
    return '该操作需要你的批准后才会继续执行。';
  }

  if (gate.status === 'expired') {
    return 'Agent 已暂停等待。你可以先在终端中完成输入，再回到这里继续等待。';
  }

  return '请在对应终端中完成交互输入。';
}

export function getHumanGateSecondaryActionLabel(gate: HumanGateRecord) {
  if (gate.kind === 'approval' || gate.kind === 'parameter_confirmation') {
    return '拒绝';
  }

  return null;
}
