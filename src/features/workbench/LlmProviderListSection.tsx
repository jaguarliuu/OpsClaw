import { Button } from '@/components/ui/button';

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
      <div className="rounded-xl border border-dashed border-neutral-800/50 bg-[#0a0b0d]/30 py-12 text-center text-sm text-neutral-400">
        <div className="mb-2 text-neutral-600">{viewModel.emptyTitle}</div>
        <div className="text-xs text-neutral-600">{viewModel.emptyDescription}</div>
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
            className="group rounded-xl border border-neutral-800/50 bg-[#17181b] p-5 transition-all duration-200 hover:border-[var(--app-border-strong)]/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <span className="truncate text-sm font-medium text-neutral-100">
                    {item.name}
                  </span>
                  {item.showDefaultProviderBadge ? (
                    <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                      默认
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded bg-[var(--app-bg-elevated3)]/50 px-2 py-0.5">
                    {item.providerLabel}
                  </span>
                  <span className="text-neutral-700">·</span>
                  <span className="font-mono">{item.baseUrlLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.models.map((model) => (
                    <span
                      key={model.name}
                      className="rounded-md border border-neutral-800 bg-[#0a0b0d] px-2.5 py-1 text-xs text-neutral-300"
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
