type SshTerminalSuggestionOverlayProps = {
  suggestion: string;
};

export function SshTerminalSuggestionOverlay({
  suggestion,
}: SshTerminalSuggestionOverlayProps) {
  return (
    <div className="absolute bottom-4 left-4 z-20 rounded-lg border border-blue-500/30 bg-[#1e2025]/95 px-3 py-2 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-500">建议:</span>
        <span className="font-mono text-[12px] text-neutral-300">{suggestion}</span>
        <span className="text-[10px] text-neutral-600">按 Tab 接受</span>
      </div>
    </div>
  );
}
