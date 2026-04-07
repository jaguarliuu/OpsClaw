import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PendingGateIndicator } from '@/features/workbench/PendingGateIndicator';
import type { LiveSession } from '@/features/workbench/types';
import {
  buildWorkbenchLayoutActions,
  buildWorkbenchToolActions,
  getWorkbenchActionClassName,
  performWorkbenchLayoutAction,
  performWorkbenchToolAction,
} from '@/features/workbench/workbenchHeaderActionsModel';
import type { SplitLayout } from '@/features/workbench/workbenchTerminalWorkspaceModel';
import { cn } from '@/lib/utils';

type TerminalWorkspaceHeaderProps = {
  desktopInteractiveStyle?: React.CSSProperties;
  activeSessionId: string | null;
  activeSession: LiveSession | null;
  desktopTopBarStyle?: React.CSSProperties;
  desktopWindowControlsInsetStyle?: React.CSSProperties;
  isUtilityDrawerOpen: boolean;
  isMacShortcutPlatform: boolean;
  sessions: LiveSession[];
  sidebarCollapsed: boolean;
  splitLayout: SplitLayout;
  pendingUiGateCount: number;
  onCloseSession: (sessionId: string) => void;
  onEnterSplitMode: (layout: 'horizontal' | 'vertical') => void;
  onExitSplitMode: () => void;
  onOpenAiAssistant: () => void;
  onOpenHelpDialog: () => void;
  onOpenPendingGates: () => void;
  onOpenNewConnection: () => void;
  onToggleUtilityDrawer: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleSidebar: () => void;
};

function SingleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function SplitHorizontalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="8" y1="2" x2="8" y2="14" />
    </svg>
  );
}

function SplitVerticalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  );
}

const layoutActionIconMap = {
  horizontal: SplitHorizontalIcon,
  single: SingleIcon,
  vertical: SplitVerticalIcon,
} as const;

function renderToolActionContent(action: ReturnType<typeof buildWorkbenchToolActions>[number]) {
  if (action.display === 'icon' && action.icon === 'sparkles') {
    return <Sparkles className="h-4 w-4" />;
  }

  return action.label;
}

export function TerminalWorkspaceHeader({
  activeSession,
  activeSessionId,
  desktopInteractiveStyle,
  desktopTopBarStyle,
  desktopWindowControlsInsetStyle,
  isUtilityDrawerOpen,
  isMacShortcutPlatform,
  pendingUiGateCount,
  sessions,
  sidebarCollapsed,
  splitLayout,
  onCloseSession,
  onEnterSplitMode,
  onExitSplitMode,
  onOpenAiAssistant,
  onOpenHelpDialog,
  onOpenPendingGates,
  onOpenNewConnection,
  onToggleUtilityDrawer,
  onSelectSession,
  onToggleSidebar,
}: TerminalWorkspaceHeaderProps) {
  const layoutActions = buildWorkbenchLayoutActions(splitLayout);
  const [helpDialogAction, utilityDrawerAction, aiAssistantAction] = buildWorkbenchToolActions({
    isMacShortcutPlatform,
    isUtilityDrawerOpen,
  });

  return (
    <>
      <header
        className="flex items-stretch justify-between border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-2"
        style={desktopTopBarStyle}
      >
        <div className="flex min-w-0 items-stretch gap-1 overflow-auto pt-2" style={desktopInteractiveStyle}>
          {sidebarCollapsed ? (
            <Button
              aria-label="展开连接管理器"
              className="mt-1 min-w-8 px-0 text-base text-neutral-400"
              onClick={onToggleSidebar}
              size="sm"
              variant="ghost"
            >
              ≡
            </Button>
          ) : null}
          {sessions.map((session, index) => (
            <button
              className={cn(
                'inline-flex max-w-64 items-center gap-2 rounded-t-md border border-transparent border-b-0 bg-[var(--app-bg-elevated3)] px-3 text-[13px] text-neutral-400',
                session.id === activeSessionId && 'bg-[var(--app-bg-elevated3)] text-[var(--app-text-primary)]'
              )}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              type="button"
            >
              <span className="text-[12px] text-neutral-500">{index + 1}</span>
              <span className="truncate">{session.username}@{session.host}</span>
              <span
                className="text-neutral-500 transition-colors hover:text-neutral-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseSession(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onCloseSession(session.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                ×
              </span>
            </button>
          ))}
          <Button
            aria-label="新建连接"
            className="mt-1 min-w-8 px-0 text-base text-neutral-400"
            onClick={onOpenNewConnection}
            size="sm"
            variant="ghost"
          >
            +
          </Button>
        </div>

        <div className="min-w-6 flex-1" />

        <div className="flex items-center gap-1 pt-2" style={desktopWindowControlsInsetStyle}>
          <div className="flex items-center">
            {layoutActions.map((action) => {
              const Icon = layoutActionIconMap[action.icon];

              return (
                <button
                  key={action.id}
                  type="button"
                  title={action.title}
                  onClick={() => {
                    performWorkbenchLayoutAction(action, {
                      onEnterSplitMode,
                      onExitSplitMode,
                    });
                  }}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-neutral-700',
                    action.tone === 'active' ? 'text-blue-400' : 'text-neutral-500'
                  )}
                >
                  <Icon />
                </button>
              );
            })}
          </div>

          <Button
            key={helpDialogAction.id}
            className={cn('transition-colors', getWorkbenchActionClassName(helpDialogAction.tone))}
            onClick={() => {
              performWorkbenchToolAction(helpDialogAction, {
                onOpenAiAssistant,
                onOpenHelpDialog,
                onToggleUtilityDrawer,
              });
            }}
            size="sm"
            type="button"
            variant={helpDialogAction.variant}
            title={helpDialogAction.title}
          >
            {renderToolActionContent(helpDialogAction)}
          </Button>

          <Button
            key={utilityDrawerAction.id}
            className={cn('transition-colors', getWorkbenchActionClassName(utilityDrawerAction.tone))}
            onClick={() => {
              performWorkbenchToolAction(utilityDrawerAction, {
                onOpenAiAssistant,
                onOpenHelpDialog,
                onToggleUtilityDrawer,
              });
            }}
            size="sm"
            type="button"
            variant={utilityDrawerAction.variant}
            title={utilityDrawerAction.title}
          >
            {renderToolActionContent(utilityDrawerAction)}
          </Button>

          <PendingGateIndicator count={pendingUiGateCount} onClick={onOpenPendingGates} />

          <Button
            key={aiAssistantAction.id}
            className={cn('transition-colors', getWorkbenchActionClassName(aiAssistantAction.tone))}
            onClick={() => {
              performWorkbenchToolAction(aiAssistantAction, {
                onOpenAiAssistant,
                onOpenHelpDialog,
                onToggleUtilityDrawer,
              });
            }}
            size="sm"
            type="button"
            variant={aiAssistantAction.variant}
            title={aiAssistantAction.title}
          >
            {renderToolActionContent(aiAssistantAction)}
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-end border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-4 text-sm text-neutral-500">
        <div className="flex items-center gap-2">
          {activeSession ? (
            <>
              <span className="rounded-full border border-[var(--app-border-default)] bg-neutral-900 px-2.5 py-1 text-xs">
                {activeSession.username}
              </span>
              <span className="rounded-full border border-[var(--app-border-default)] bg-neutral-900 px-2.5 py-1 text-xs">
                {activeSession.host}
              </span>
              <span
                className={cn(
                  'rounded-full border border-[var(--app-border-default)] bg-neutral-900 px-2.5 py-1 text-xs',
                  activeSession.status === 'connected' && 'text-emerald-400'
                )}
              >
                {activeSession.status}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
