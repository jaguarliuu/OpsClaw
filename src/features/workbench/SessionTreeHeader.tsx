import { SESSION_TREE_TITLE } from '@/features/workbench/sessionTreeChromeModel';

type SessionTreeHeaderProps = {
  desktopTopBarStyle?: React.CSSProperties;
};

export function SessionTreeHeader({
  desktopTopBarStyle,
}: SessionTreeHeaderProps) {
  return (
    <header
      className="flex items-center border-b border-[var(--app-border-default)] px-4 py-3"
      style={desktopTopBarStyle}
    >
      <strong className="text-[15px] font-medium tracking-[0.08em] text-[var(--app-text-primary)]">
        {SESSION_TREE_TITLE}
      </strong>
    </header>
  );
}
