import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ConnectionFormValues } from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type ConnectionModalProps = {
  formValues: ConnectionFormValues;
  errorMessage: string | null;
  isSubmitting: boolean;
  onChange: <K extends keyof ConnectionFormValues>(
    key: K,
    value: ConnectionFormValues[K]
  ) => void;
  onClose: () => void;
  onConnect: (saveProfile: boolean) => Promise<void>;
  onSaveOnly: () => Promise<void>;
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
        'inline-flex items-center rounded-full px-0 py-0 text-sm text-neutral-300 transition-colors',
        active ? 'text-white' : 'text-neutral-400'
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          'mr-2 inline-block h-4 w-4 rounded-full border border-neutral-500',
          active && 'border-blue-500 shadow-[inset_0_0_0_4px_theme(colors.blue.500)]'
        )}
      />
      {children}
    </button>
  );
}

export function ConnectionModal({
  formValues,
  errorMessage,
  isSubmitting,
  onChange,
  onClose,
  onConnect,
  onSaveOnly,
}: ConnectionModalProps) {
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0">
        <DialogHeader>
          <DialogTitle>新建连接配置</DialogTitle>
          <Button className="h-7 px-2 text-neutral-300" onClick={onClose} size="sm" variant="ghost">
            关闭
          </Button>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">连接名称</Label>
            <Input
              disabled={isSubmitting}
              onChange={(event) => onChange('label', event.target.value)}
              placeholder="请输入连接名称"
              value={formValues.label}
            />
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">服务器</Label>
            <Input
              disabled={isSubmitting}
              onChange={(event) => onChange('host', event.target.value)}
              placeholder="请输入 IP 地址，或选择产品后按关键字搜索"
              value={formValues.host}
            />
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">连接协议</Label>
            <div className="flex items-center gap-8">
              <AuthOptionButton active onClick={() => undefined}>
                终端连接（SSH）
              </AuthOptionButton>
              <AuthOptionButton active={false} onClick={() => undefined}>
                远程桌面（RDP）
              </AuthOptionButton>
            </div>
          </div>

          <div className="grid grid-cols-[88px_minmax(0,180px)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">连接端口</Label>
            <Input
              disabled={isSubmitting}
              onChange={(event) => onChange('port', event.target.value)}
              value={formValues.port}
            />
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">验证方式</Label>
            <div className="flex items-center gap-8">
              <AuthOptionButton
                active={formValues.authMode === 'password'}
                onClick={() => {
                  if (isSubmitting) {
                    return;
                  }

                  onChange('authMode', 'password');
                }}
              >
                密码验证
              </AuthOptionButton>
              <AuthOptionButton
                active={formValues.authMode === 'privateKey'}
                onClick={() => {
                  if (isSubmitting) {
                    return;
                  }

                  onChange('authMode', 'privateKey');
                }}
              >
                密钥验证
              </AuthOptionButton>
            </div>
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
            <Label className="pt-2 text-xs font-medium text-neutral-300">凭据</Label>
            <div className="rounded-md border border-[var(--app-border-strong)] bg-[var(--app-bg-elevated3)]/80 p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-neutral-400">用户名</Label>
                  <Input
                    disabled={isSubmitting}
                    onChange={(event) => onChange('username', event.target.value)}
                    placeholder="root"
                    value={formValues.username}
                  />
                </div>

                {formValues.authMode === 'password' ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-neutral-400">密码</Label>
                    <Input
                      disabled={isSubmitting}
                      onChange={(event) => onChange('password', event.target.value)}
                      placeholder="请输入密码或选择托管密码"
                      type="password"
                      value={formValues.password}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-neutral-400">私钥</Label>
                      <Textarea
                        className="min-h-28"
                        disabled={isSubmitting}
                        onChange={(event) => onChange('privateKey', event.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        value={formValues.privateKey}
                      />
                    </div>
                    <div className="space-y-2">
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

                <p className="text-xs leading-5 text-neutral-500">
                  如果需要将密码或密钥保存为凭据，请在后续版本接入统一凭据管理。
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
            <Label className="text-xs font-medium text-neutral-300">更多配置</Label>
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-full border border-[var(--app-border-strong)] bg-[var(--app-bg-elevated3)] px-2.5 py-1 text-neutral-400">
                无标签 / normal
              </span>
              <button className="text-blue-400 transition-colors hover:text-blue-300" type="button">
                展开编辑
              </button>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={isSubmitting} onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button disabled={isSubmitting} onClick={() => void onSaveOnly()} variant="secondary">
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
          <Button disabled={isSubmitting} onClick={() => void onConnect(true)}>
            {isSubmitting ? '连接中...' : '连接并保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
