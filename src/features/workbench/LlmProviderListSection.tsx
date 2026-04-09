import { Button } from '@/components/ui/button';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from './settingsTheme';

import type { LlmProvider } from './types';

type LlmProviderListSectionProps = {
  providers: LlmProvider[];
  onDelete: (id: string) => void;
  onEdit: (provider: LlmProvider) => void;
  onSetDefault: (id: string) => void;
  viewModel: {
    emptyTitle: string;
    emptyDescription: string;
    items: Array<{
      id: string;
      name: string;
      providerLabel: string;
      baseUrlLabel: string;
      showDefaultProviderBadge: boolean;
      models: Array<{ name: string; label: string }>;
    }>;
  };
};

export function LlmProviderListSection({
  providers,
  onDelete,
  onEdit,
  onSetDefault,
  viewModel,
}: LlmProviderListSectionProps) {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));

  if (viewModel.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--app-border-default)] bg-[var(--app-bg-base)] py-12 text-center text-sm text-[var(--app-text-secondary)]">
        <div className={`mb-2 ${SETTINGS_TEXT_TERTIARY_CLASS}`}>{viewModel.emptyTitle}</div>
        <div className={`text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>{viewModel.emptyDescription}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {viewModel.items.map((item) => {
        const provider = providersById.get(item.id);
        if (!provider) {
          return null;
        }

        return (
          <div
            key={item.id}
            className={`${SETTINGS_PANEL_CLASS} group p-5 transition-all duration-200 hover:border-[var(--app-border-strong)]/50`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <span className={`truncate text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                    {item.name}
                  </span>
                  {item.showDefaultProviderBadge ? (
                    <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                      默认
                    </span>
                  ) : null}
                </div>
                <div className={`flex flex-wrap items-center gap-2 text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                  <span className="rounded bg-[var(--app-bg-elevated3)]/50 px-2 py-0.5">
                    {item.providerLabel}
                  </span>
                  <span className={SETTINGS_TEXT_TERTIARY_CLASS}>·</span>
                  <span className="font-mono">{item.baseUrlLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.models.map((model) => (
                    <span
                      key={model.name}
                      className="rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-2.5 py-1 text-xs text-[var(--app-text-secondary)]"
                    >
                      {model.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {!item.showDefaultProviderBadge ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSetDefault(item.id)}
                    className="h-8 text-xs"
                  >
                    设为默认
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onEdit(provider)}
                  className="h-8 text-xs"
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(item.id)}
                  className="h-8 text-xs hover:bg-red-500/10 hover:text-red-400"
                >
                  删除
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
