import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { LlmProvider, LlmProviderType } from './types';
import { fetchLlmProviders, createLlmProvider, updateLlmProvider, deleteLlmProvider, setDefaultLlmProvider } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
};

export function LlmProviderSettings({ open, onClose, embedded = false }: Props) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    providerType: 'zhipu' as LlmProviderType,
    apiKey: '',
    models: [] as string[],
  });
  const [modelInput, setModelInput] = useState('');

  useEffect(() => {
    if (open || embedded) {
      void fetchLlmProviders().then(setProviders);
    }
  }, [open, embedded]);

  const handleEdit = (provider: LlmProvider) => {
    setEditing(provider.id);
    setFormData({
      name: provider.name,
      providerType: provider.providerType,
      apiKey: '',
      models: provider.models,
    });
  };

  const handleSave = async () => {
    if (editing) {
      await updateLlmProvider(editing, formData);
    } else {
      await createLlmProvider(formData);
    }
    const updated = await fetchLlmProviders();
    setProviders(updated);
    setEditing(null);
    setFormData({ name: '', providerType: 'zhipu', apiKey: '', models: [] });
    setModelInput('');
  };

  const handleAddModel = () => {
    const trimmed = modelInput.trim();
    if (trimmed && !formData.models.includes(trimmed)) {
      setFormData({ ...formData, models: [...formData.models, trimmed] });
      setModelInput('');
    }
  };

  const handleRemoveModel = (model: string) => {
    setFormData({ ...formData, models: formData.models.filter(m => m !== model) });
  };

  const handleDelete = async (id: string) => {
    await deleteLlmProvider(id);
    const updated = await fetchLlmProviders();
    setProviders(updated);
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultLlmProvider(id);
    const updated = await fetchLlmProviders();
    setProviders(updated);
  };

  if (!open && !embedded) return null;

  const content = (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">
      {/* 已配置的提供商 */}
      {providers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-[var(--app-text-primary)] uppercase tracking-wide">已配置的提供商</h3>
          <div className="space-y-2">
            {providers.map(p => (
              <div key={p.id} className="group relative p-4 bg-[var(--app-bg-elevated3)] rounded-lg border border-[var(--app-border-default)] hover:border-[var(--app-border-strong)] transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-semibold text-[var(--app-text-primary)]">{p.name}</span>
                      {p.isDefault && (
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-blue-500/20 text-blue-400 rounded">默认</span>
                      )}
                    </div>
                    <div className="text-[12px] text-[var(--app-text-tertiary)]">
                      {p.providerType} · {p.models.join(', ')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!p.isDefault && (
                    <Button size="sm" variant="secondary" onClick={() => handleSetDefault(p.id)} className="text-[12px]">
                      设为默认
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(p)} className="text-[12px]">
                    编辑
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleDelete(p.id)} className="text-[12px] text-red-400 hover:text-red-300">
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加新提供商 */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-[var(--app-text-primary)] uppercase tracking-wide">
          {editing ? '编辑提供商' : '添加新提供商'}
        </h3>
        <div className="p-4 bg-[var(--app-bg-elevated3)] rounded-lg border border-[var(--app-border-default)] space-y-4">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-[var(--app-text-secondary)]">名称</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：我的智谱AI"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-[var(--app-text-secondary)]">提供商</Label>
            <select
              value={formData.providerType}
              onChange={e => setFormData({ ...formData, providerType: e.target.value as LlmProviderType })}
              className="w-full h-9 px-3 bg-[var(--app-bg-base)] border border-[var(--app-border-default)] rounded-md text-[13px] text-[var(--app-text-primary)] outline-none focus:border-[var(--app-accent-primary)] transition-colors"
            >
              <option value="zhipu">智谱 GLM</option>
              <option value="minimax">MiniMax</option>
              <option value="qwen">通义千问</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-[var(--app-text-secondary)]">模型</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={modelInput}
                  onChange={e => setModelInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddModel();
                    }
                  }}
                  placeholder="输入模型名称，按回车添加"
                  className="h-9 flex-1"
                />
                <Button onClick={handleAddModel} size="sm" variant="secondary" className="h-9">
                  添加
                </Button>
              </div>
              {formData.models.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-[var(--app-bg-base)] rounded-md border border-[var(--app-border-default)]">
                  {formData.models.map(model => (
                    <span
                      key={model}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--app-bg-elevated3)] text-[var(--app-text-primary)] text-[12px] rounded-md border border-[var(--app-border-default)]"
                    >
                      {model}
                      <button
                        onClick={() => handleRemoveModel(model)}
                        className="text-[var(--app-text-tertiary)] hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-[var(--app-text-secondary)]">API Key</Label>
            <Input
              type="password"
              value={formData.apiKey}
              onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="输入您的 API Key"
              className="h-9 font-mono text-[12px]"
            />
          </div>

          <Button onClick={handleSave} className="w-full h-9 bg-[var(--app-accent-primary)] hover:bg-[var(--app-accent-primary-hover)] text-white font-medium">
            {editing ? '更新配置' : '添加提供商'}
          </Button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[var(--app-bg-elevated2)] border-l border-[var(--app-border-default)] flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border-default)]">
        <h2 className="text-sm font-medium text-[var(--app-text-primary)]">LLM 配置</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-[var(--app-text-primary)]">
          <X className="w-4 h-4" />
        </button>
      </div>
      {content}
    </div>
  );
}
