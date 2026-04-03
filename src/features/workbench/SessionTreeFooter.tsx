import { buildSessionTreeFooterActions } from '@/features/workbench/sessionTreeChromeModel';

type SessionTreeFooterProps = {
  onOpenNewConnection: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
};

export function SessionTreeFooter({
  onOpenNewConnection,
  onOpenSettings,
  onToggleCollapse,
}: SessionTreeFooterProps) {
  const actions = buildSessionTreeFooterActions();

  return (
    <footer className="border-t border-[var(--app-border-default)] px-2 py-2">
      <div className="grid gap-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => {
              if (action.id === 'new-connection') {
                onOpenNewConnection();
                return;
              }
              if (action.id === 'collapse-sidebar') {
                onToggleCollapse();
                return;
              }
              onOpenSettings();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-[var(--app-bg-elevated3)]/60 hover:text-[var(--app-text-secondary)]"
          >
            {action.id === 'new-connection' ? (
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            ) : null}
            {action.id === 'collapse-sidebar' ? (
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
              </svg>
            ) : null}
            {action.id === 'open-settings' ? (
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            ) : null}
            {action.label}
          </button>
        ))}
      </div>
    </footer>
  );
}
