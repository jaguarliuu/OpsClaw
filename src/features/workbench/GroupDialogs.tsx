import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SavedConnectionGroup, SavedConnectionProfile } from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type GroupNameDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  value: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
};

export function GroupNameDialog({
  open,
  title,
  description,
  confirmLabel,
  value,
  errorMessage,
  isSubmitting,
  onClose,
  onConfirm,
  onValueChange,
}: GroupNameDialogProps) {
  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="w-[min(420px,calc(100vw-24px))]">
        <DialogHeader className="block">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-2 leading-6">{description}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="grid gap-2">
            <Label className="text-xs text-neutral-400">分组名称</Label>
            <Input
              autoFocus
              disabled={isSubmitting}
              onChange={(event) => onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onConfirm()
                }
              }}
              placeholder="输入分组名称"
              value={value}
            />
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={isSubmitting} onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? '处理中...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MoveProfileDialogProps = {
  open: boolean;
  profile: SavedConnectionProfile | null;
  groups: SavedConnectionGroup[];
  selectedGroupId: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSelectGroup: (groupId: string) => void;
};

export function MoveProfileDialog({
  open,
  profile,
  groups,
  selectedGroupId,
  errorMessage,
  isSubmitting,
  onClose,
  onConfirm,
  onSelectGroup,
}: MoveProfileDialogProps) {
  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="w-[min(520px,calc(100vw-24px))]">
        <DialogHeader className="block">
          <DialogTitle>移动到分组</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            {profile ? `为节点「${profile.name}」选择目标分组。` : '选择目标分组。'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] overflow-auto px-6 py-5">
          {groups.length === 0 ? (
            <div className="rounded-md border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-400">
              还没有可用分组，请先新建分组。
            </div>
          ) : (
            <div className="grid gap-2">
              {groups.map((group) => {
                const isSelected = group.id === selectedGroupId
                const isCurrentGroup = profile?.groupId === group.id

                return (
                  <button
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 text-neutral-100'
                        : 'border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-[var(--app-border-strong)] hover:bg-neutral-900'
                    )}
                    key={group.id}
                    onClick={() => onSelectGroup(group.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{group.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {group.profiles.length} 台主机
                        {group.isDefault ? ' · 默认分组' : ''}
                        {isCurrentGroup ? ' · 当前所在分组' : ''}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'ml-4 h-4 w-4 rounded-full border border-neutral-600',
                        isSelected && 'border-blue-500 shadow-[inset_0_0_0_4px_theme(colors.blue.500)]'
                      )}
                    />
                  </button>
                )
              })}
            </div>
          )}

          {errorMessage ? (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={isSubmitting} onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button
            disabled={isSubmitting || !selectedGroupId || selectedGroupId === profile?.groupId}
            onClick={onConfirm}
          >
            {isSubmitting ? '处理中...' : '移动'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
