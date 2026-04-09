import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
} from './settingsTheme';

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
          <Label className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>名称</Label>
          <Input
            placeholder="例如：我的智谱 GLM"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className={`h-10 ${SETTINGS_INPUT_CLASS}`}
          />
        </div>

        <div className="space-y-2">
          <Label className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>提供商</Label>
          <Select value={providerType} onValueChange={(value: string) => onProviderTypeChange(value as LlmProviderType)}>
            <SelectTrigger className={`h-10 ${SETTINGS_INPUT_CLASS}`}>
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
        <Label className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>Base URL</Label>
        <Input
          placeholder={viewModel.baseUrlPlaceholder}
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          className={`h-10 font-mono text-sm ${SETTINGS_INPUT_CLASS}`}
        />
        <p className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>{viewModel.baseUrlHint}</p>
      </div>
    </>
  );
}
