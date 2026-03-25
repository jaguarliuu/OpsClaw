import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  destructive?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = '取消',
  confirmLabel = '确认',
  description,
  destructive = false,
  errorMessage = null,
  onClose,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="w-[min(420px,calc(100vw-24px))]">
        <DialogHeader className="block">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-2 leading-6">{description}</DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div className="mx-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            {cancelLabel}
          </Button>
          <Button
            className={destructive ? 'bg-red-600 hover:bg-red-500' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
