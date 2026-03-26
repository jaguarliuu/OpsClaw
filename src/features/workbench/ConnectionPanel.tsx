import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    <aside
      aria-hidden={!open}
      className={cn(
        'overflow-hidden border-l border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] transition-[width,opacity] duration-200 ease-out',
        open ? 'w-[392px] opacity-100' : 'w-0 opacity-0'
      )}
    >
      <div className="grid h-full min-h-screen grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center justify-between border-b border-[var(--app-border-default)] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            <p className="mt-1 text-xs text-neutral-500">需要配置时展开，不需要时收起</p>
          </div>
          <Button className="h-8 px-2 text-neutral-400" onClick={onClose} size="sm" variant="ghost">
            关闭
          </Button>
        </header>

        <div className="min-h-0 overflow-auto px-5 py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label className="text-xs text-neutral-400">连接名称</Label>
              <Input
                disabled={isSubmitting}
                onChange={(event) => onChange('label', event.target.value)}
                placeholder="my-server"
                value={formValues.label}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-neutral-400">服务器</Label>
              <Input
                disabled={isSubmitting}
                onChange={(event) => onChange('host', event.target.value)}
                placeholder="43.167.163.53"
                value={formValues.host}
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-3">
              <div className="grid gap-2">
                <Label className="text-xs text-neutral-400">用户名</Label>
                <Input
                  disabled={isSubmitting}
                  onChange={(event) => onChange('username', event.target.value)}
                  placeholder="ubuntu"
                  value={formValues.username}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs text-neutral-400">端口</Label>
                <Input
                  disabled={isSubmitting}
                  onChange={(event) => onChange('port', event.target.value)}
                  value={formValues.port}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-neutral-400">验证方式</Label>
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
                <Label className="text-xs text-neutral-400">密码</Label>
                <Input
                  disabled={isSubmitting}
                  onChange={(event) => onChange('password', event.target.value)}
                  placeholder="请输入密码"
                  type="password"
                  value={formValues.password}
                />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label className="text-xs text-neutral-400">私钥</Label>
                  <Textarea
                    className="min-h-40"
                    disabled={isSubmitting}
                    onChange={(event) => onChange('privateKey', event.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={formValues.privateKey}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs text-neutral-400">密钥口令</Label>
                  <Input
                    disabled={isSubmitting}
                    onChange={(event) => onChange('passphrase', event.target.value)}
                    placeholder="可选"
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
              <Label className="text-xs text-neutral-400">跳板机（可选）</Label>
              <select
                id="jump-host"
                disabled={isSubmitting}
                value={formValues.jumpHostId}
                onChange={(e) => onChange('jumpHostId', e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--app-border-strong)] bg-neutral-900 px-3 text-[13px] text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-50"
              >
                <option value="">无（直连）</option>
                {savedProfiles
                  .filter((p) => p.id !== currentNodeId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.host})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--app-border-default)] px-5 py-4">
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
            收起
          </Button>
          <Button disabled={isSubmitting} onClick={() => void onSaveOnly()} variant="secondary">
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
          <Button disabled={isSubmitting} onClick={() => void onConnect(true)}>
            {isSubmitting ? '连接中...' : '连接并保存'}
          </Button>
          </div>
        </footer>
      </div>
    </aside>
  );
}
