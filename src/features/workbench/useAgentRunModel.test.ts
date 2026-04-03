import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTimelineItem } from './types.agent.js';
import {
  applyAgentEventToTimeline,
  mapAgentEventToTimelineItem,
} from './useAgentRunModel.js';

void test('applyAgentEventToTimeline merges assistant_message_delta events into a single assistant item for the same step', () => {
  const firstPass = applyAgentEventToTimeline(
    [],
    {
      type: 'assistant_message_delta',
      runId: 'run-1',
      delta: '正在',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-1'
  );

  assert.deepEqual(firstPass, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在',
      step: 1,
    },
  ]);

  const secondPass = applyAgentEventToTimeline(
    firstPass,
    {
      type: 'assistant_message_delta',
      runId: 'run-1',
      delta: '检查磁盘',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-2'
  );

  assert.deepEqual(secondPass, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查磁盘',
      step: 1,
    },
  ]);
});

void test('applyAgentEventToTimeline lets assistant_message replace the merged delta text with the finalized content', () => {
  const initialItems: AgentTimelineItem[] = [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查',
      step: 1,
    },
  ];

  const items = applyAgentEventToTimeline(
    initialItems,
    {
      type: 'assistant_message',
      runId: 'run-1',
      text: '正在检查磁盘空间并准备给出结论。',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-2'
  );

  assert.deepEqual(items, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查磁盘空间并准备给出结论。',
      step: 1,
    },
  ]);
});

void test('maps approval_required events into warning timeline items while preserving policy metadata', () => {
  const item = mapAgentEventToTimelineItem(
    {
      type: 'approval_required',
      runId: 'run-1',
      step: 2,
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      reason: '命令命中敏感操作策略，需要用户审批后执行。',
      policy: {
        action: 'require_approval',
        matches: [
          {
            ruleId: 'service.restart',
            title: '服务重启',
            severity: 'high',
            reason: '命令会重启或停止服务，可能影响在线流量。',
            matchedText: 'systemctl restart',
          },
        ],
      },
      timestamp: Date.now(),
    },
    'item-1'
  );

  assert.deepEqual(item, {
    id: 'item-1',
    kind: 'warning',
    text: '工具 session.run_command 需要审批：命令命中敏感操作策略，需要用户审批后执行。',
    step: 2,
    policy: {
      action: 'require_approval',
      matches: [
        {
          ruleId: 'service.restart',
          title: '服务重启',
          severity: 'high',
          reason: '命令会重启或停止服务，可能影响在线流量。',
          matchedText: 'systemctl restart',
        },
      ],
    },
  });
});

void test('maps failed tool results while preserving policy metadata on the result envelope', () => {
  const item = mapAgentEventToTimelineItem(
    {
      type: 'tool_execution_finished',
      runId: 'run-1',
      step: 3,
      toolCallId: 'call-2',
      toolName: 'session.run_command',
      result: {
        toolName: 'session.run_command',
        toolCallId: 'call-2',
        ok: false,
        error: {
          code: 'tool_denied',
          message: '命令命中敏感操作策略，当前模式仅允许只读或低风险命令。',
          retryable: false,
        },
        meta: {
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
          policy: {
            action: 'deny',
            matches: [
              {
                ruleId: 'shell.delete.recursive',
                title: '递归删除',
                severity: 'critical',
                reason: '命令包含递归删除，可能造成不可逆数据丢失。',
                matchedText: 'rm -rf',
              },
            ],
          },
        },
      },
      timestamp: Date.now(),
    },
    'item-2'
  );

  assert.equal(item?.kind, 'tool_result');
  assert.equal(item?.result.meta.policy?.action, 'deny');
  assert.equal(item?.result.meta.policy?.matches[0]?.ruleId, 'shell.delete.recursive');
});

void test('returns null for run_started because it should not append a timeline item', () => {
  assert.equal(
    mapAgentEventToTimelineItem(
      {
        type: 'run_started',
        runId: 'run-1',
        sessionId: 'session-1',
        task: 'check disk',
        timestamp: Date.now(),
      },
      'item-3'
    ),
    null
  );
});
