import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type LlmProviderModelSectionProps = {
  customModelInput: string;
  defaultModel: string;
  onAddCustomModel: () => void;
  onCustomModelInputChange: (value: string) => void;
  onCustomModelInputEnter: () => void;
  onDefaultModelChange: (value: string) => void;
  onPresetModelClick: (model: string) => void;
  onRemoveModel: (model: string) => void;
  viewModel: {
    presetModels: Array<{ name: string; selected: boolean }>;
    selectedModels: Array<{ name: string; isDefaultModel: boolean; label: string }>;
    emptyStateMessage: string;
  };
};

export function LlmProviderModelSection({
  customModelInput,
  defaultModel,
  onAddCustomModel,
  onCustomModelInputChange,
  onCustomModelInputEnter,
  onDefaultModelChange,
  onPresetModelClick,
  onRemoveModel,
  viewModel,
}: LlmProviderModelSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">预设候选</Label>
        <div className="flex flex-wrap gap-2">
          {viewModel.presetModels.map((model) => (
            <Button
              key={model.name}
              type="button"
              variant={model.selected ? 'secondary' : 'ghost'}
              onClick={() => onPresetModelClick(model.name)}
              className="h-8 rounded-md border border-neutral-800 px-3 text-xs"
            >
              {model.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">添加自定义模型</Label>
        <div className="flex gap-2">
          <Input
            placeholder="例如：gpt-4.1-nano"
            value={customModelInput}
            onChange={(event) => onCustomModelInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onCustomModelInputEnter();
              }
            }}
            className="h-10 border-neutral-800/50 bg-[#0a0b0d] font-mono text-sm transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={onAddCustomModel}
            className="h-10"
          >
            添加
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">已选模型</Label>
        {viewModel.selectedModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 bg-[#0a0b0d]/60 px-3 py-4 text-sm text-neutral-500">
            {viewModel.emptyStateMessage}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {viewModel.selectedModels.map((model) => (
              <div
                key={model.name}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-[#0a0b0d] px-3 py-2 text-xs text-neutral-200"
              >
                <span className="font-mono">{model.label}</span>
                {model.isDefaultModel ? (
                  <span className="text-blue-400">默认</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemoveModel(model.name)}
                  className="text-neutral-500 transition-colors hover:text-red-400"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">默认模型</Label>
        <Select value={defaultModel} onValueChange={onDefaultModelChange}>
          <SelectTrigger className="h-10 border-neutral-800/50 bg-[#0a0b0d] transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20">
            <SelectValue placeholder="请选择默认模型" />
          </SelectTrigger>
          <SelectContent>
            {viewModel.selectedModels.map((model) => (
              <SelectItem key={model.name} value={model.name}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
