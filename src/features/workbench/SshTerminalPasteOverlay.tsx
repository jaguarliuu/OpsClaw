type SshTerminalPasteOverlayProps = {
  pendingPaste: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SshTerminalPasteOverlay({
  pendingPaste,
  onCancel,
  onConfirm,
}: SshTerminalPasteOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[480px] rounded-xl border border-[var(--app-border-strong)] bg-[#1e2025] p-5 shadow-2xl">
        <h3 className="mb-2 text-[14px] font-semibold text-neutral-100">粘贴多行内容</h3>
        <p className="mb-3 text-[12px] text-neutral-400">
          即将粘贴 {pendingPaste.split('\n').length} 行内容，确认继续？
        </p>
        <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-neutral-900 p-3 text-[12px] text-neutral-300 whitespace-pre-wrap break-all">
          {pendingPaste.length > 500 ? pendingPaste.slice(0, 500) + '...' : pendingPaste}
        </pre>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] text-white hover:bg-blue-500"
          >
            确认粘贴
          </button>
        </div>
      </div>
    </div>
  );
}
