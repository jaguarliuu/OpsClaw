import { ScriptLibraryPanel } from '@/features/workbench/ScriptLibraryPanel';

type UtilityDrawerProps = {
  activeNodeId: string | null;
  activeSessionId: string | null;
  activeSessionLabel: string | null;
  open: boolean;
  onClose: () => void;
  onExecuteCommand: (command: string) => void;
};

export function UtilityDrawer({
  activeNodeId,
  activeSessionId,
  activeSessionLabel,
  open,
  onClose,
  onExecuteCommand,
}: UtilityDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <ScriptLibraryPanel
      activeNodeId={activeNodeId}
      activeSessionId={activeSessionId}
      activeSessionLabel={activeSessionLabel}
      onClose={onClose}
      onExecuteCommand={onExecuteCommand}
    />
  );
}
