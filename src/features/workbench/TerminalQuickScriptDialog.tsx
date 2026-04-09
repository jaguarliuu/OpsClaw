import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ScriptLibraryItem } from './types';

type TerminalQuickScriptDialogProps = {
  open: boolean;
  script: ScriptLibraryItem | null;
  values: Record<string, string>;
  errorMessage: string | null;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function TerminalQuickScriptDialog({
  open,
  script,
  values,
  errorMessage,
  onChange,
  onClose,
  onConfirm,
}: TerminalQuickScriptDialogProps) {
  const variables = script?.variables ?? [];

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>执行模板脚本</DialogTitle>
          <DialogDescription>
            {script ? `${script.alias} · ${script.title}` : '填写变量后渲染最终命令。'}
          </DialogDescription>
        </DialogHeader>

        {script ? (
          <div className="space-y-4">
            <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs text-neutral-300">
                {script.content}
              </pre>
            </div>

            {variables.length > 0 ? (
              <div className="grid gap-3">
                {variables.map((variable) => {
                  const inputId = `terminal-quick-script-${variable.name}`;
                  const value = values[variable.name] ?? '';

                  return (
                    <div className="grid gap-2" key={variable.name}>
                      <Label htmlFor={inputId}>
                        {variable.label}
                        {variable.required ? ' *' : ''}
                      </Label>
                      {variable.inputType === 'textarea' ? (
                        <Textarea
                          id={inputId}
                          onChange={(event) => {
                            onChange(variable.name, event.target.value);
                          }}
                          placeholder={variable.placeholder}
                          value={value}
                        />
                      ) : (
                        <Input
                          id={inputId}
                          onChange={(event) => {
                            onChange(variable.name, event.target.value);
                          }}
                          placeholder={variable.placeholder}
                          value={value}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">该模板脚本没有变量，确认后将直接执行。</p>
            )}

            {errorMessage ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button onClick={onClose} type="button" variant="ghost">
                取消
              </Button>
              <Button onClick={onConfirm} type="button">
                执行脚本
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
