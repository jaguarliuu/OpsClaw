import { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Send,
  SquareStop,
  TerminalSquare,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { AGENT_MAX_STEP_OPTIONS } from './agentRunSettings';
import { useAiAssistantPanelState } from './useAiAssistantPanelState';
import { useStreamingChat } from './useStreamingChat';
import type { UseAgentRunResult } from './useAgentRun';
import {
  createAiAssistantInputImeState,
  getAiAssistantHeaderActionsState,
  getInlineAiAssistantInteraction,
  getAiAssistantPrimaryActionState,
  getAgentStepBudgetHint,
  getAiAssistantThemeClasses,
  getValidAiAssistantModelValue,
  getValidAiAssistantSessionId,
  markAiAssistantInputCompositionEnd,
  markAiAssistantInputCompositionStart,
  shouldAutoScrollAiAssistantTimeline,
  shouldPresentAiAssistantInteractionDialog,
  shouldSubmitAiAssistantOnEnter,
} from './aiAssistantPanelModel';
import { createAgentSessionModel } from './agentSessionModel';
import { InteractionCard } from './InteractionCard';
import { formatAgentPolicySummary } from './agentPolicyUiModel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildDesktopPanelHeaderStyle } from '@/features/workbench/desktopWindowChromeModel';
import type { LiveSession } from './types';
import type { AgentTimelineItem, ToolExecutionEnvelope } from './types.agent';
import { useTerminalSettings } from './useTerminalSettings';

function formatToolArguments(args: Record<string, unknown>) {
  return ['```json', JSON.stringify(args, null, 2), '```'].join('\n');
}

function formatToolResult(result: ToolExecutionEnvelope) {
  if (!result.ok) {
    return result.error?.message ?? '工具执行失败。';
  }

  if (result.toolName === 'session.run_command' && result.data && typeof result.data === 'object') {
    const payload = result.data as {
      command?: unknown;
      exitCode?: unknown;
      output?: unknown;
      durationMs?: unknown;
      truncated?: unknown;
    };
    const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : '';
    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : '';
    const output =
      typeof payload.output === 'string' && payload.output ? payload.output : '[无输出]';

    return [
      `- 退出码：\`${exitCode}\``,
      `- 耗时：\`${durationMs}ms\``,
      typeof payload.command === 'string' ? `- 命令：\`${payload.command}\`` : null,
      payload.truncated ? '[输出已截断]' : null,
      '',
      '```bash',
      output,
      '```',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return ['```json', JSON.stringify(result.data ?? result.error ?? {}, null, 2), '```'].join('\n');
}

function ToolCallCard({
  item,
  themeMode,
}: {
  item: Extract<AgentTimelineItem, { kind: 'tool_call' }>;
  themeMode: 'dark' | 'light';
}) {
  const [expanded, setExpanded] = useState(false);
  const accentTextClass = themeMode === 'light' ? 'text-sky-700' : 'text-sky-200';

  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.10),rgba(14,165,233,0.03))] shadow-[0_12px_32px_rgba(2,132,199,0.08)]">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${accentTextClass}`}>
              Tool Call
            </span>
            <span className="text-[11px] text-[var(--app-text-secondary)]">步骤 {item.step}</span>
          </div>
          <div className="truncate text-sm font-medium text-[var(--app-text-primary)]">{item.toolName}</div>
        </div>
        <div className="flex items-center gap-2 text-[var(--app-text-secondary)]">
          <span className="text-xs">{expanded ? '收起参数' : '查看参数'}</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-white/8 px-4 py-4">
          <MarkdownContent
            content={formatToolArguments(item.arguments)}
            className="text-xs leading-relaxed text-[var(--app-text-primary)]"
          />
        </div>
      ) : null}
    </div>
  );
}

function SessionRunCommandResult({
  result,
  themeMode,
}: {
  result: ToolExecutionEnvelope;
  themeMode: 'dark' | 'light';
}) {
  const successTextClass = themeMode === 'light' ? 'text-emerald-700' : 'text-emerald-200';
  const warningTextClass = themeMode === 'light' ? 'text-amber-700' : 'text-amber-200';
  const payload = result.data as {
    command?: unknown;
    exitCode?: unknown;
    output?: unknown;
    durationMs?: unknown;
    truncated?: unknown;
  };
  const command = typeof payload.command === 'string' ? payload.command : '未知命令';
  const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
  const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : null;
  const output = typeof payload.output === 'string' && payload.output ? payload.output : '[无输出]';
  const truncated = payload.truncated === true;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-tertiary)]">命令</div>
          <div className="mt-1 break-all font-mono text-xs text-[var(--app-text-primary)]">{command}</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-tertiary)]">退出码</div>
          <div className="mt-1 text-sm font-medium text-[var(--app-text-primary)]">
            {exitCode === null ? '-' : exitCode}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-tertiary)]">耗时</div>
          <div className="mt-1 text-sm font-medium text-[var(--app-text-primary)]">
            {durationMs === null ? '-' : `${durationMs}ms`}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8 bg-[var(--app-bg-base)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-2 text-[var(--app-text-primary)]">
            <TerminalSquare className={`h-4 w-4 ${successTextClass}`} />
            <span className="text-xs font-medium tracking-[0.16em] text-[var(--app-text-secondary)] uppercase">
              终端输出
            </span>
          </div>
          {truncated ? (
            <span className={`rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] ${warningTextClass}`}>
              已截断
            </span>
          ) : null}
        </div>
        <MarkdownContent content={['```bash', output, '```'].join('\n')} className="px-3 pb-3" />
      </div>

    </div>
  );
}

function ToolResultCard({
  item,
  themeMode,
}: {
  item: Extract<AgentTimelineItem, { kind: 'tool_result' }>;
  themeMode: 'dark' | 'light';
}) {
  const [expanded, setExpanded] = useState(true);
  const isCommandResult = item.toolName === 'session.run_command' && item.result.ok;
  const successTextClass = themeMode === 'light' ? 'text-emerald-700' : 'text-emerald-200';
  const errorTextClass = themeMode === 'light' ? 'text-red-700' : 'text-red-200';
  const policySummary = formatAgentPolicySummary(item.result.meta.policy);

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-[0_14px_34px_rgba(0,0,0,0.16)] ${
        item.result.ok
          ? 'border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.10),rgba(16,185,129,0.03))] text-[var(--app-text-primary)]'
          : 'border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.10),rgba(239,68,68,0.03))] text-[var(--app-text-primary)]'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${
                item.result.ok
                  ? `border border-emerald-400/20 bg-emerald-400/10 ${successTextClass}`
                  : `border border-red-400/20 bg-red-400/10 ${errorTextClass}`
              }`}
            >
              Tool Result
            </span>
            <span className="text-[11px] text-[var(--app-text-secondary)]">步骤 {item.step}</span>
          </div>
          <div className="truncate text-sm font-medium text-[var(--app-text-primary)]">{item.toolName}</div>
        </div>
        <div className="flex items-center gap-2 text-[var(--app-text-secondary)]">
          <span className="text-xs">{expanded ? '收起结果' : '查看结果'}</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-white/8 px-4 py-4">
          {policySummary ? (
            <div className="mb-3 rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2 text-xs text-[var(--app-text-secondary)]">
              {policySummary}
            </div>
          ) : null}
          {isCommandResult ? (
            <SessionRunCommandResult result={item.result} themeMode={themeMode} />
          ) : (
            <MarkdownContent content={formatToolResult(item.result)} className="text-xs leading-relaxed" />
          )}
        </div>
      ) : null}
    </div>
  );
}

function AgentTimelineCard({
  item,
  themeMode,
}: {
  item: AgentTimelineItem;
  themeMode: 'dark' | 'light';
}) {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-blue-600 p-3 text-white">
          <div className="mb-1.5 text-[10px] uppercase tracking-wide opacity-60">你</div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{item.text}</div>
        </div>
      </div>
    );
  }

  if (item.kind === 'assistant') {
    return (
      <div className="overflow-hidden rounded-xl border border-violet-500/15 bg-[linear-gradient(180deg,rgba(129,140,248,0.10),rgba(129,140,248,0.04))] shadow-[0_16px_38px_rgba(79,70,229,0.08)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className={`rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${themeMode === 'light' ? 'text-violet-700' : 'text-violet-200'}`}>
                AI Summary
              </span>
              <span className="text-[11px] text-[var(--app-text-secondary)]">步骤 {item.step}</span>
            </div>
            <div className="text-sm font-medium text-[var(--app-text-primary)]">分析与下一步</div>
          </div>
          <WandSparkles className={`h-4 w-4 ${themeMode === 'light' ? 'text-violet-700' : 'text-violet-200/80'}`} />
        </div>
        <div className="px-4 py-4 text-[var(--app-text-primary)]">
          <MarkdownContent content={item.text} className="text-sm leading-relaxed" />
        </div>
      </div>
    );
  }

  if (item.kind === 'tool_call') {
    return <ToolCallCard item={item} themeMode={themeMode} />;
  }

  if (item.kind === 'tool_result') {
    return <ToolResultCard item={item} themeMode={themeMode} />;
  }

  if (item.kind === 'warning') {
    const policySummary = formatAgentPolicySummary(item.policy);

    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-[var(--app-status-warning)]">
        <div>{item.text}</div>
        {policySummary ? (
          <div className="mt-2 text-xs text-[var(--app-text-secondary)]">{policySummary}</div>
        ) : null}
      </div>
    );
  }

  if (item.kind === 'final') {
    return (
      <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04))] shadow-[0_16px_38px_rgba(5,150,105,0.08)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className={`rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${themeMode === 'light' ? 'text-emerald-700' : 'text-emerald-200'}`}>
                Final Answer
              </span>
              <span className="text-[11px] text-[var(--app-text-secondary)]">共 {item.steps} 步</span>
            </div>
            <div className="text-sm font-medium text-[var(--app-text-primary)]">任务结论</div>
          </div>
          <CheckCircle2 className={`h-4 w-4 ${themeMode === 'light' ? 'text-emerald-700' : 'text-emerald-200/80'}`} />
        </div>
        <div className="px-4 py-4 text-[var(--app-text-primary)]">
          <MarkdownContent content={item.text} className="text-sm leading-relaxed" />
        </div>
      </div>
    );
  }

  return (
      <div className="rounded-xl border border-[var(--app-border-default)] bg-[var(--app-bg-elevated3)] p-3 text-sm text-[var(--app-text-secondary)]">
      {item.text}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  sessions: LiveSession[];
  activeSessionId: string | null;
  agentRun: UseAgentRunResult;
  requestedMode?: 'agent' | 'chat' | null;
  requestedRunId?: string | null;
  onRequestedModeApplied?: () => void;
  onRequestedRunApplied?: () => void;
};

export function AiAssistantPanel({
  open,
  onClose,
  sessions,
  activeSessionId,
  agentRun,
  requestedMode = null,
  requestedRunId = null,
  onRequestedModeApplied,
  onRequestedRunApplied,
}: Props) {
  const { appTheme } = useTerminalSettings();
  const {
    messages: chatMessages,
    isStreaming,
    error: chatError,
    sendMessage,
    stopStreaming,
    clearMessages: clearChatMessages,
  } = useStreamingChat();
  const {
    items: agentItems,
    isRunning,
    error: agentError,
    runAgent,
    stopAgent,
    submitInteraction,
    clearItems: clearAgentItems,
  } = agentRun;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputImeStateRef = useRef(createAiAssistantInputImeState());
  const agentSessionModel = createAgentSessionModel({
    activeInteraction: agentRun.activeInteraction,
    pendingContinuationRunId: agentRun.pendingContinuationRunId,
  });

  const {
    canSend,
    input,
    mode,
    modelOptions,
    selectedModel,
    selectedAgentMaxSteps,
    selectedSessionId,
    setSelectedAgentMaxSteps,
    setInput,
    setMode,
    setSelectedModel,
    setSelectedSessionId,
    startDragging,
    width,
  } = useAiAssistantPanelState({
    open,
    activeSessionId,
    sessions,
    isAgentInputLocked: agentSessionModel.isInteractionLocked,
    isRunning,
    isStreaming,
  });
  const visibleError = mode === 'agent' ? agentError : chatError;
  const isBusy = mode === 'agent' ? isRunning : isStreaming;
  const isAgentInputLocked = mode === 'agent' && agentSessionModel.isInteractionLocked;
  const canClearAgentItems = mode !== 'agent' || agentSessionModel.canClearAgentItems;
  const themeClasses = getAiAssistantThemeClasses(appTheme.mode);
  const desktopPanelHeaderStyle = buildDesktopPanelHeaderStyle({
    runtime: window.__OPSCLAW_RUNTIME__,
    location: window.location,
  });
  const headerActionsState = getAiAssistantHeaderActionsState(canClearAgentItems);
  const primaryActionState = getAiAssistantPrimaryActionState({
    isBusy,
    canSend,
    isAgentInputLocked,
  });
  const activeDialogInteraction = shouldPresentAiAssistantInteractionDialog(
    agentRun.activeInteraction
  )
    ? agentRun.activeInteraction
    : null;
  const activeInlineInteraction = getInlineAiAssistantInteraction(agentRun.activeInteraction);
  const resolvedSelectedModel = getValidAiAssistantModelValue(modelOptions, selectedModel);
  const resolvedSelectedSessionId = getValidAiAssistantSessionId(
    sessions,
    selectedSessionId,
    activeSessionId
  );
  const visibleItemCount =
    mode === 'agent'
      ? agentItems.length + (agentRun.activeInteraction ? 1 : 0)
      : chatMessages.length;
  const visibleContentSignature =
    mode === 'agent'
      ? [
          agentRun.activeInteraction
            ? `interaction:${agentRun.activeInteraction.id}:${agentRun.activeInteraction.status}`
            : null,
          ...agentItems.map((item) => {
            switch (item.kind) {
              case 'assistant':
              case 'user':
              case 'warning':
              case 'status':
              case 'final':
                return `${item.kind}:${item.text.length}`;
              case 'tool_call':
                return `${item.kind}:${item.toolName}:${JSON.stringify(item.arguments).length}`;
              case 'tool_result':
                return `${item.kind}:${item.toolName}:${JSON.stringify(item.result).length}`;
              default:
                return ((unreachable: never) => unreachable)(item);
            }
          }),
        ]
          .filter(Boolean)
          .join('|')
      : chatMessages.map((message) => `${message.role}:${message.content.length}`).join('|');
  const previousOpenRef = useRef(open);
  const previousModeRef = useRef(mode);
  const previousVisibleItemCountRef = useRef(visibleItemCount);
  const previousVisibleContentSignatureRef = useRef(visibleContentSignature);

  useEffect(() => {
    if (!open || !requestedMode) {
      return;
    }

    setMode(requestedMode);
    onRequestedModeApplied?.();
  }, [onRequestedModeApplied, open, requestedMode, setMode]);

  useEffect(() => {
    if (!open || !requestedRunId) {
      return;
    }

    setMode('agent');
    const requestedPendingInteraction = agentRun.pendingInteractions.find(
      (item) => item.runId === requestedRunId
    );
    const targetSessionId =
      requestedPendingInteraction?.sessionId ??
      (agentRun.activeInteraction?.runId === requestedRunId
        ? agentRun.activeInteraction.sessionId
        : null);

    if (targetSessionId) {
      setSelectedSessionId(targetSessionId);
    }

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onRequestedRunApplied?.();
    });
  }, [
    agentRun.activeInteraction,
    agentRun.pendingInteractions,
    onRequestedRunApplied,
    open,
    requestedRunId,
    setMode,
    setSelectedSessionId,
  ]);

  useEffect(() => {
    const shouldScroll = shouldAutoScrollAiAssistantTimeline({
      open,
      previousOpen: previousOpenRef.current,
      mode,
      previousMode: previousModeRef.current,
      visibleContentSignature,
      previousVisibleContentSignature: previousVisibleContentSignatureRef.current,
      visibleItemCount,
      previousVisibleItemCount: previousVisibleItemCountRef.current,
    });

    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    previousOpenRef.current = open;
    previousModeRef.current = mode;
    previousVisibleItemCountRef.current = visibleItemCount;
    previousVisibleContentSignatureRef.current = visibleContentSignature;
  }, [open, mode, visibleContentSignature, visibleItemCount]);

  const handleSend = () => {
    if (!input.trim() || !resolvedSelectedModel) return;
    const option = modelOptions.find(o => o.value === resolvedSelectedModel);
    if (!option) return;

    if (mode === 'agent') {
      if (!resolvedSelectedSessionId || isRunning || !agentSessionModel.canStartAgentRun) {
        return;
      }

      const session = sessions.find(item => item.id === resolvedSelectedSessionId);
      if (!session) {
        return;
      }

      void runAgent({
        providerId: option.providerId,
        model: option.modelName,
        maxSteps: selectedAgentMaxSteps,
        task: input.trim(),
        sessionId: session.id,
      });
      setInput('');
      return;
    }

    if (isStreaming) {
      return;
    }

    sendMessage(option.providerId, option.modelName, input.trim());
    setInput('');
  };

  const handlePrimaryAction = () => {
    if (primaryActionState.kind === 'stop') {
      if (mode === 'agent') {
        stopAgent();
        return;
      }

      stopStreaming();
      return;
    }

    handleSend();
  };

  if (!open) return null;

  return (
    <div 
      className="fixed inset-y-0 right-0 bg-[var(--app-bg-elevated2)] border-l border-[var(--app-border-default)] flex flex-col z-50 shadow-2xl"
      style={{ width: `${width}px` }}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors -ml-[2px]"
        onMouseDown={(e) => {
          e.preventDefault();
          startDragging();
        }}
      />
      <div
        className="flex items-start gap-3 border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-4 py-3"
        style={desktopPanelHeaderStyle}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h2 className={`text-[13px] font-semibold ${themeClasses.primaryTextClass} uppercase tracking-wider`}>OpsClaw AI</h2>
          <div className="flex items-center gap-1 bg-neutral-800/40 p-0.5 rounded-lg border border-neutral-700/50">
            <button
              type="button"
              onClick={() => setMode('agent')}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-all ${
                mode === 'agent'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `bg-transparent ${themeClasses.secondaryTextClass} hover:text-[var(--app-text-primary)] hover:bg-neutral-700/50`
              }`}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-all ${
                mode === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `bg-transparent ${themeClasses.secondaryTextClass} hover:text-[var(--app-text-primary)] hover:bg-neutral-700/50`
              }`}
            >
              Chat
            </button>
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1 self-start">
          <button
            onClick={mode === 'agent' ? clearAgentItems : clearChatMessages}
            disabled={!canClearAgentItems}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
              canClearAgentItems
                ? `${themeClasses.secondaryTextClass} hover:bg-[var(--app-bg-elevated3)] hover:text-[var(--app-text-primary)]`
                : 'cursor-not-allowed text-[var(--app-text-tertiary)] opacity-60'
            }`}
            title={headerActionsState.newConversationTitle}
          >
            <span>新对话</span>
          </button>
          <div className="w-px h-3 bg-neutral-700 mx-1"></div>
          <button
            onClick={onClose}
            className={`p-1.5 ${themeClasses.secondaryTextClass} hover:text-[var(--app-text-primary)] hover:bg-[var(--app-bg-elevated3)] rounded-md transition-colors`}
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {((mode === 'agent' && agentItems.length === 0 && activeInlineInteraction === null) ||
          (mode === 'chat' && chatMessages.length === 0)) && (
          <div className="flex flex-col items-center h-full max-w-md mx-auto pt-8 px-4">
            <div className="w-14 h-14 bg-neutral-800/50 rounded-[1.25rem] flex items-center justify-center mb-6 shadow-inner border border-neutral-700/50">
              <WandSparkles className="w-6 h-6 text-neutral-300" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">你好</h1>
            <h2 className="text-[17px] font-semibold text-neutral-200 mb-3">我是 OpsClaw助手</h2>
            <p className="text-[11px] text-neutral-400 text-center mb-8 max-w-[280px] leading-relaxed">
              该组件将为您联动终端和可视化的工作流，提供从调试到自动化的一体化体验
            </p>

            <div className="w-full space-y-2.5">
              <button onClick={() => setInput('使用 OpenClaw')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1e1e1e] border border-neutral-800/50 hover:bg-[#252525] hover:border-neutral-700 transition-all text-left group shadow-sm">
                <WandSparkles className="w-4 h-4 text-orange-400 group-hover:text-orange-300" />
                <span className="text-[12px] text-neutral-300 group-hover:text-neutral-100">使用 OpenClaw</span>
              </button>
              <button onClick={() => setInput('将您常见ICT命令转为批处理文件')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1e1e1e] border border-neutral-800/50 hover:bg-[#252525] hover:border-neutral-700 transition-all text-left group shadow-sm">
                <TerminalSquare className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                <span className="text-[12px] text-neutral-300 group-hover:text-neutral-100">将您常见ICT命令转为批处理文件</span>
              </button>
              <button onClick={() => setInput('作为输入卡片传入给命令')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1e1e1e] border border-neutral-800/50 hover:bg-[#252525] hover:border-neutral-700 transition-all text-left group shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                <span className="text-[12px] text-neutral-300 group-hover:text-neutral-100">作为输入卡片传入给命令</span>
              </button>
              <button onClick={() => setInput('分析输入的数据流向')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1e1e1e] border border-neutral-800/50 hover:bg-[#252525] hover:border-neutral-700 transition-all text-left group shadow-sm">
                <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                <span className="text-[12px] text-neutral-300 group-hover:text-neutral-100">分析输入的数据流向</span>
              </button>
            </div>

            <div className="mt-auto pt-8 flex flex-col items-center gap-4 pb-4">
              <div className="text-[11px] text-neutral-500">
                选择会话后，助手可联动终端：发送命令、读取输出
              </div>
              <button onClick={() => {
                const ta = document.querySelector('.ai-assistant-textarea') as HTMLTextAreaElement;
                if (ta) ta.focus();
              }} className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                立即体验
              </button>
            </div>
          </div>
        )}
        {mode === 'agent'
          ? (
              <>
                {activeInlineInteraction ? (
                  <InteractionCard
                    request={activeInlineInteraction}
                    disabled={isRunning}
                    onSubmit={(actionId, payload) =>
                      submitInteraction(
                        activeInlineInteraction.runId,
                        activeInlineInteraction.id,
                        actionId,
                        payload
                      )
                    }
                  />
                ) : null}
                {agentItems.map((item) => (
                  <div key={item.id}>
                    <AgentTimelineCard item={item} themeMode={appTheme.mode} />
                  </div>
                ))}
              </>
            )
          : chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : `bg-[var(--app-bg-elevated3)] ${themeClasses.primaryTextClass} border border-[var(--app-border-default)]`
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide mb-1.5 opacity-60">
                    {msg.role === 'user' ? '你' : 'AI'}
                  </div>
                  {msg.role === 'user' ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <MarkdownContent content={msg.content} className="text-sm leading-relaxed" />
                  )}
                </div>
              </div>
            ))}
        {visibleError && (
          <div className={`p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm ${themeClasses.errorTextClass}`}>
            {visibleError}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[var(--app-bg-elevated2)] flex flex-col gap-3 shrink-0 z-10 relative shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]">
        {mode === 'agent' ? (
          <div className={`rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs ${themeClasses.infoTextClass}`}>
            Agent 会通过 ReAct 方式选择命令、下发到选中的 SSH session，并基于结果继续执行直到完成任务。
          </div>
        ) : null}

        <div className="flex items-center gap-2 px-1">
          <TerminalSquare className="w-4 h-4 text-neutral-500" />
          <span className="text-[11px] text-neutral-500 font-medium">上下文</span>
          <Select value={resolvedSelectedSessionId ?? ''} onValueChange={setSelectedSessionId}>
            <SelectTrigger className="h-6 px-2 py-0 text-[11px] bg-neutral-800/50 border border-neutral-700/50 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors w-auto min-w-[120px] max-w-[200px]" title="选择会话">
              <SelectValue placeholder="选择会话" />
            </SelectTrigger>
            <SelectContent side="top">
              {sessions.map(session => (
                <SelectItem key={session.id} value={session.id} className="text-xs py-1">
                  {session.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border border-neutral-700/60 rounded-xl bg-[var(--app-bg-base)] overflow-hidden focus-within:border-neutral-500 focus-within:ring-1 focus-within:ring-neutral-500/30 transition-all relative flex flex-col">
	          <textarea
	            value={input}
	            onChange={e => setInput(e.target.value)}
	            onCompositionStart={() => {
	              inputImeStateRef.current = markAiAssistantInputCompositionStart(
	                inputImeStateRef.current
	              );
	            }}
	            onCompositionEnd={() => {
	              inputImeStateRef.current = markAiAssistantInputCompositionEnd(
	                inputImeStateRef.current,
	                Date.now()
	              );
	            }}
	            onKeyDown={e => {
	              if (
	                shouldSubmitAiAssistantOnEnter({
	                  event: {
	                    isComposing: e.nativeEvent.isComposing,
	                    key: e.key,
	                    keyCode: e.nativeEvent.keyCode,
	                    shiftKey: e.shiftKey,
	                  },
	                  imeState: inputImeStateRef.current,
	                  now: Date.now(),
	                })
	              ) {
	                e.preventDefault();
	                handleSend();
	              }
	            }}
            placeholder={
              mode === 'agent'
                ? isAgentInputLocked
                  ? '请先处理当前交互卡片，再发起新的 Agent 任务'
                  : '例如：检查当前机器磁盘和内存是否异常，并给出结论'
                : '请输入你的问题，按 Enter 发送'
            }
            disabled={!selectedModel || isBusy || isAgentInputLocked}
            rows={3}
            className="ai-assistant-textarea w-full px-3 pt-3 pb-2 bg-transparent border-0 text-[13px] text-[var(--app-text-primary)] placeholder:text-neutral-600 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-2">
              <Select value={resolvedSelectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-7 px-2 py-0 text-[11px] bg-transparent border-0 text-blue-400 hover:text-blue-300 w-auto min-w-[80px]" title="选择模型">
                  <div className="flex items-center gap-1.5">
                    <WandSparkles className="w-3.5 h-3.5" />
                    <SelectValue placeholder="选择模型" />
                  </div>
                </SelectTrigger>
                <SelectContent side="top">
                  {modelOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs py-1">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'agent' ? (
                <Select
                  value={String(selectedAgentMaxSteps)}
                  onValueChange={(value) => setSelectedAgentMaxSteps(Number.parseInt(value, 10))}
                >
                  <SelectTrigger
                    className="h-7 px-2 py-0 text-[11px] bg-transparent border-0 text-neutral-400 hover:text-neutral-300 w-auto min-w-[60px]"
                    title="总步数预算"
                  >
                    <SelectValue placeholder="总步数" />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {AGENT_MAX_STEP_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)} className="text-xs py-1">
                        {option} 步
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            
            <button
              onClick={handlePrimaryAction}
              disabled={primaryActionState.disabled}
              aria-label={primaryActionState.ariaLabel}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-all ${
                primaryActionState.kind === 'stop'
                  ? 'bg-amber-500 hover:bg-amber-400'
                  : 'bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800'
              } disabled:text-neutral-500 disabled:opacity-50`}
              title={primaryActionState.title}
            >
              {primaryActionState.kind === 'stop' ? (
                <SquareStop className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="text-center text-[10px] text-neutral-600 font-medium">
          内容由 AI 生成，仅供参考
        </div>

        {mode === 'agent' ? (
          <div className="absolute top-2 right-4 text-[10px] text-[var(--app-text-secondary)]">
            {getAgentStepBudgetHint(selectedAgentMaxSteps)}
          </div>
        ) : null}
        
        {isBusy && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 backdrop-blur-sm">
            {mode === 'agent' ? 'Agent 正在执行任务...' : 'AI 正在回复...'}
          </div>
        )}
      </div>

      <Dialog open={activeDialogInteraction !== null} onOpenChange={() => {}}>
        {activeDialogInteraction ? (
          <DialogContent
            className="w-[min(680px,calc(100vw-32px))] max-w-none overflow-hidden border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-0 text-[var(--app-text-primary)]"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="block border-[var(--app-border-default)] px-5 py-4">
              <DialogTitle className="text-sm font-semibold text-[var(--app-text-primary)]">
                待处理交互
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-6 text-[var(--app-text-secondary)]">
                Agent 运行未中断，当前步骤正在等待你通过前端卡片补充参数或确认执行。
              </DialogDescription>
            </DialogHeader>

            <div className="px-5 py-5">
              <InteractionCard
                request={activeDialogInteraction}
                disabled={isRunning}
                onSubmit={(actionId, payload) =>
                  submitInteraction(
                    activeDialogInteraction.runId,
                    activeDialogInteraction.id,
                    actionId,
                    payload
                  )
                }
              />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
