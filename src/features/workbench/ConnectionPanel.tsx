import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConnectionFormValues, SavedConnectionProfile } from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type ConnectionPanelProps = {
  open: boolean;
  canDelete: boolean;
  title: string;
  formValues: ConnectionFormValues;
  errorMessage: string | null;
  isSubmitting: boolean;
  savedProfiles: SavedConnectionProfile[];
  currentNodeId: string | null;
  onChange: <K extends keyof ConnectionFormValues>(
    key: K,
    value: ConnectionFormValues[K]
  ) => void;
  onClose: () => void;
  onConnect: (saveProfile: boolean) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onSaveOnly: () => Promise<void> | void;
};

function AuthOptionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-full px-0 py-0 text-sm transition-colors',
        active ? 'text-neutral-100' : 'text-neutral-500'
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          'mr-2 inline-block h-4 w-4 rounded-full border border-neutral-600',
          active && 'border-blue-500 shadow-[inset_0_0_0_4px_theme(colors.blue.500)]'
        )}
      />
      {children}
    </button>
  );
}

export function ConnectionPanel({
  open,
  canDelete,
  title,
  formValues,
  errorMessage,
  isSubmitting,
  savedProfiles,
  currentNodeId,
  onChange,
  onClose,
  onConnect,
  onDelete,
  onSaveOnly,
}: ConnectionPanelProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[min(880px,calc(100vw-32px))] max-w-none overflow-hidden border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-0 text-[var(--app-text-primary)]">
        <div className="grid max-h-[calc(100vh-40px)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="border-[var(--app-border-default)] px-6 py-4">
            <div>
              <DialogTitle className="text-sm font-semibold text-[var(--app-text-primary)]">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-[var(--app-text-secondary)]">
                使用居中配置窗口管理连接，后续可继续扩展高级能力。
              </DialogDescription>
            </div>
            <Button className="h-8 px-2 text-[var(--app-text-secondary)]" onClick={onClose} size="sm" variant="ghost">
              关闭
            </Button>
          </DialogHeader>

          <div className="min-h-0 overflow-auto px-6 py-5">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label className="text-xs text-[var(--app-text-secondary)]">连接名称</Label>
                <Input
                  disabled={isSubmitting}
                  onChange={(event) => onChange('label', event.target.value)}
                  placeholder="my-server"
                  value={formValues.label}
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs text-[var(--app-text-secondary)]">服务器</Label>
                <Input
                  disabled={isSubmitting}
                  onChange={(event) => onChange('host', event.target.value)}
                  placeholder="43.167.163.53"
                  value={formValues.host}
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-3">
                <div className="grid gap-2">
                  <Label className="text-xs text-[var(--app-text-secondary)]">用户名</Label>
                  <Input
                    disabled={isSubmitting}
                    onChange={(event) => onChange('username', event.target.value)}
                    placeholder="ubuntu"
                    value={formValues.username}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs text-[var(--app-text-secondary)]">端口</Label>
                  <Input
                    disabled={isSubmitting}
                    onChange={(event) => onChange('port', event.target.value)}
                    value={formValues.port}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs text-[var(--app-text-secondary)]">验证方式</Label>
                <div className="flex items-center gap-8 rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-3 py-3">
                  <AuthOptionButton
                    active={formValues.authMode === 'password'}
                    onClick={() => {
                      if (!isSubmitting) {
                        onChange('authMode', 'password');
                      }
                    }}
                  >
                    密码验证
                  </AuthOptionButton>
                  <AuthOptionButton
                    active={formValues.authMode === 'privateKey'}
                    onClick={() => {
                      if (!isSubmitting) {
                        onChange('authMode', 'privateKey');
                      }
                    }}
                  >
                    密钥验证
                  </AuthOptionButton>
                </div>
              </div>

              {formValues.authMode === 'password' ? (
                <div className="grid gap-2">
                  <Label className="text-xs text-[var(--app-text-secondary)]">密码</Label>
                  <Input
                    disabled={isSubmitting}
                    onChange={(event) => onChange('password', event.target.value)}
                    placeholder={formValues.hasSavedPassword ? '留空则保留现有密码' : '请输入密码'}
                    type="password"
                    value={formValues.password}
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label className="text-xs text-[var(--app-text-secondary)]">私钥</Label>
                    <Textarea
                      className="min-h-40"
                      disabled={isSubmitting}
                      onChange={(event) => onChange('privateKey', event.target.value)}
                      placeholder={
                        formValues.hasSavedPrivateKey
                          ? '留空则保留现有私钥'
                          : '-----BEGIN OPENSSH PRIVATE KEY-----'
                      }
                      value={formValues.privateKey}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs text-[var(--app-text-secondary)]">密钥口令</Label>
                    <Input
                      disabled={isSubmitting}
                      onChange={(event) => onChange('passphrase', event.target.value)}
                      placeholder={formValues.hasSavedPassphrase ? '留空则保留现有口令' : '可选'}
                      type="password"
                      value={formValues.passphrase}
                    />
                  </div>
                </>
              )}

              {errorMessage ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label className="text-xs text-[var(--app-text-secondary)]">跳板机（可选）</Label>
                <Select
                  disabled={isSubmitting}
                  value={formValues.jumpHostId || 'none'}
                  onValueChange={(value) => onChange('jumpHostId', value === 'none' ? '' : value)}
                >
                  <SelectTrigger
                    id="jump-host"
                    className="h-9 w-full rounded-md border border-[var(--app-border-strong)] bg-neutral-900 px-3 text-[13px] text-neutral-100 disabled:opacity-50"
                    title="选择跳板机"
                  >
                    <SelectValue placeholder="无（直连）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无（直连）</SelectItem>
                    {savedProfiles
                      .filter((p) => p.id !== currentNodeId)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.host})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="justify-between border-[var(--app-border-default)] px-6 py-4">
            <div>
              {canDelete ? (
                <Button
                  className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  disabled={isSubmitting}
                  onClick={() => void onDelete()}
                  variant="ghost"
                >
                  删除
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Button disabled={isSubmitting} onClick={onClose} variant="ghost">
                取消
              </Button>
              <Button disabled={isSubmitting} onClick={() => void onSaveOnly()} variant="secondary">
                {isSubmitting ? '保存中...' : '保存'}
              </Button>
              <Button disabled={isSubmitting} onClick={() => void onConnect(true)}>
                {isSubmitting ? '连接中...' : '连接并保存'}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
