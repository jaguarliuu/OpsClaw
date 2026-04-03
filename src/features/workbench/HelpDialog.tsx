import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildHelpDialogContent } from '@/features/workbench/helpDialogModel';

type HelpDialogProps = {
  isMacShortcutPlatform: boolean;
  onClose: () => void;
  open: boolean;
};

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
      {children}
    </h3>
  );
}

export function HelpDialog({
  isMacShortcutPlatform,
  onClose,
  open,
}: HelpDialogProps) {
  const content = buildHelpDialogContent(isMacShortcutPlatform);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[min(860px,calc(100vw-32px))] max-w-none overflow-hidden border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-0 text-[var(--app-text-primary)]">
        <div className="grid max-h-[calc(100vh-40px)] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader className="border-[var(--app-border-default)] px-6 py-4">
            <div>
              <DialogTitle className="text-base font-semibold text-[var(--app-text-primary)]">
                {content.title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[var(--app-text-secondary)]">
                {content.description}
              </DialogDescription>
            </div>
            <Button
              className="h-8 px-2 text-[var(--app-text-secondary)]"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              关闭
            </Button>
          </DialogHeader>

          <div className="min-h-0 overflow-auto px-6 py-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <section className="grid gap-6">
                <div className="grid gap-3">
                  <SectionTitle>OpsClaw 简介</SectionTitle>
                  {content.introduction.map((item) => (
                    <p key={item} className="text-sm leading-6 text-[var(--app-text-primary)]">
                      {item}
                    </p>
                  ))}
                </div>

                <div className="grid gap-3">
                  <SectionTitle>核心功能</SectionTitle>
                  <div className="grid gap-3">
                    {content.coreFeatures.map((item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-4 py-3 text-sm leading-6 text-[var(--app-text-primary)]"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  <SectionTitle>使用提示</SectionTitle>
                  <div className="grid gap-2">
                    {content.usageTips.map((item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-4 py-3 text-sm leading-6 text-[var(--app-text-secondary)]"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-3">
                <SectionTitle>全局快捷键</SectionTitle>
                <div className="rounded-xl border border-[var(--app-border-default)] bg-[var(--app-bg-base)] p-3">
                  <div className="grid gap-2">
                    {content.shortcuts.map((item) => (
                      <div
                        key={`${item.key}-${item.label}`}
                        className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] px-3 py-2.5"
                      >
                        <span className="rounded-md border border-[var(--app-border-strong)] bg-[var(--app-bg-elevated2)] px-2 py-1 text-center text-xs font-medium text-[var(--app-text-primary)]">
                          {item.key}
                        </span>
                        <span className="text-sm text-[var(--app-text-primary)]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
