import { Button } from '@/components/ui/button';

type SessionTreeHeaderProps = {
  desktopTopBarStyle?: React.CSSProperties;
  onOpenNewConnection: () => void;
  onToggleCollapse: () => void;
};

export function SessionTreeHeader({
  desktopTopBarStyle,
  onOpenNewConnection,
  onToggleCollapse,
}: SessionTreeHeaderProps) {
  return (
    <header
      className="flex items-center justify-between border-b border-[var(--app-border-default)] px-4 py-3"
      style={desktopTopBarStyle}
    >
      <strong className="text-[15px] font-medium text-[var(--app-text-primary)]">连接管理器</strong>
      <div className="flex items-center gap-1">
        <Button onClick={onOpenNewConnection} size="sm" variant="ghost">
          新建
        </Button>
        <Button aria-label="折叠连接管理器" onClick={onToggleCollapse} size="sm" variant="ghost">
          ←
        </Button>
      </div>
    </header>
  );
}
