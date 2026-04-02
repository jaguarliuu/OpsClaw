import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { LlmProviderType } from './types';

type LlmProviderBasicsSectionProps = {
  baseUrl: string;
  name: string;
  providerType: LlmProviderType;
  onBaseUrlChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onProviderTypeChange: (value: LlmProviderType) => void;
  viewModel: {
    providerOptions: Array<{ value: LlmProviderType; label: string }>;
    baseUrlPlaceholder: string;
    baseUrlHint: string;
  };
};

export function LlmProviderBasicsSection({
  baseUrl,
  name,
  providerType,
  onBaseUrlChange,
  onNameChange,
  onProviderTypeChange,
  viewModel,
}: LlmProviderBasicsSectionProps) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-neutral-300">名称</Label>
          <Input
            placeholder="例如：我的智谱 GLM"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-10 border-neutral-800/50 bg-[#0a0b0d] transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-neutral-300">提供商</Label>
          <Select value={providerType} onValueChange={(value: string) => onProviderTypeChange(value as LlmProviderType)}>
            <SelectTrigger className="h-10 border-neutral-800/50 bg-[#0a0b0d] transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {viewModel.providerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-300">Base URL</Label>
        <Input
          placeholder={viewModel.baseUrlPlaceholder}
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          className="h-10 border-neutral-800/50 bg-[#0a0b0d] font-mono text-sm transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
        <p className="text-xs text-neutral-500">{viewModel.baseUrlHint}</p>
      </div>
    </>
  );
}
