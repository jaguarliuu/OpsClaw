import { randomUUID } from 'node:crypto';

import type { ToolExecutionEnvelope } from './agentTypes.js';

export type SessionMemoryEntry = {
  id: string;
  sessionId: string;
  createdAt: number;
  task: string;
  kind: 'tool_observation' | 'final_answer';
  toolName?: string;
  summary: string;
};

const MAX_MEMORY_ENTRIES_PER_SESSION = 24;
const MAX_MEMORY_SUMMARY_LENGTH = 1200;

function trimText(text: string, maxLength = MAX_MEMORY_SUMMARY_LENGTH) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...[已截断]`;
}

function summarizeToolEnvelope(envelope: ToolExecutionEnvelope): string | null {
  if (envelope.toolName === 'session.get_metadata') {
    return null;
  }

  if (envelope.toolName === 'session.run_command' && envelope.ok && envelope.data && typeof envelope.data === 'object') {
    const payload = envelope.data as {
      command?: unknown;
      exitCode?: unknown;
      output?: unknown;
      durationMs?: unknown;
    };
    const command = typeof payload.command === 'string' ? payload.command : '未知命令';
    const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : null;
    const output =
      typeof payload.output === 'string' && payload.output.trim()
        ? payload.output.trim()
        : '[无输出]';

    return trimText(
      [
        `命令：${command}`,
        `退出码：${exitCode ?? '-'}`,
        `耗时：${durationMs ?? '-'}ms`,
        '输出：',
        output,
      ].join('\n')
    );
  }

  if (envelope.ok) {
    return trimText(JSON.stringify(envelope.data ?? {}, null, 2));
  }

  return trimText(envelope.error?.message ?? '工具执行失败。');
}

export class AgentMemoryStore {
  private readonly entriesBySession = new Map<string, SessionMemoryEntry[]>();

  getRecentSessionMemories(sessionId: string, limit = 8) {
    const entries = this.entriesBySession.get(sessionId) ?? [];
    return entries.slice(-limit);
  }

  appendToolObservation(
    sessionId: string,
    task: string,
    envelope: ToolExecutionEnvelope
  ) {
    const summary = summarizeToolEnvelope(envelope);
    if (!summary) {
      return;
    }

    this.appendMemory({
      id: randomUUID(),
      sessionId,
      createdAt: Date.now(),
      task,
      kind: 'tool_observation',
      toolName: envelope.toolName,
      summary,
    });
  }

  appendFinalAnswer(sessionId: string, task: string, finalAnswer: string) {
    const normalized = finalAnswer.trim();
    if (!normalized) {
      return;
    }

    this.appendMemory({
      id: randomUUID(),
      sessionId,
      createdAt: Date.now(),
      task,
      kind: 'final_answer',
      summary: trimText(normalized),
    });
  }

  private appendMemory(entry: SessionMemoryEntry) {
    const current = this.entriesBySession.get(entry.sessionId) ?? [];
    const next = [...current, entry];
    this.entriesBySession.set(
      entry.sessionId,
      next.slice(-MAX_MEMORY_ENTRIES_PER_SESSION)
    );
  }
}
