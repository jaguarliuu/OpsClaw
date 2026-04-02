import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LlmProviderSubmitSectionProps = {
  apiKey: string;
  canSave: boolean;
  onApiKeyChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  viewModel: {
    apiKeyPlaceholder: string;
    primaryActionLabel: string;
    showCancelAction: boolean;
  };
};

export function LlmProviderSubmitSection({
  apiKey,
  canSave,
  onApiKeyChange,
  onCancel,
  onSave,
  viewModel,
}: LlmProviderSubmitSectionProps) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">API Key</Label>
        <Input
          type="password"
          placeholder={viewModel.apiKeyPlaceholder}
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          className="h-10 border-neutral-800/50 bg-[#0a0b0d] font-mono text-sm transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
      </div>

      <div className="flex gap-3 pt-2">
        {viewModel.showCancelAction ? (
          <Button
            onClick={onCancel}
            variant="secondary"
            className="h-10 flex-1 transition-colors hover:bg-[var(--app-bg-elevated3)]"
          >
            取消
          </Button>
        ) : null}
        <Button
          onClick={onSave}
          disabled={!canSave}
          className="h-10 flex-1 bg-blue-600 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {viewModel.primaryActionLabel}
        </Button>
      </div>
    </>
  );
}
