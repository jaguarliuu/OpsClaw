import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { LlmProvider, LlmProviderType } from './types';
import { fetchLlmProviders, createLlmProvider, updateLlmProvider, deleteLlmProvider, setDefaultLlmProvider } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PRESET_MODELS = {
  zhipu: [
    { value: 'glm-4-plus', label: 'GLM-4 Plus（推荐）' },
    { value: 'glm-4-air', label: 'GLM-4 Air（快速）' },
    { value: 'glm-4-flash', label: 'GLM-4 Flash（极速）' },
  ],
  minimax: [
    { value: 'abab6.5-chat', label: 'MiniMax-6.5（推荐）' },
    { value: 'abab6.5s-chat', label: 'MiniMax-6.5s（快速）' },
  ],
  qwen: [
    { value: 'qwen-plus', label: 'Qwen Plus（推荐）' },
    { value: 'qwen-turbo', label: 'Qwen Turbo（快速）' },
    { value: 'qwen-max', label: 'Qwen Max（最强）' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder（代码）' },
  ],
};

type Props = {
  open: boolean;
  onClose: () => void;
  onProviderChange: () => void;
};

export function LlmProviderSettings({ open, onClose, onProviderChange }: Props) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    providerType: 'zhipu' as LlmProviderType,
    apiKey: '',
    model: 'glm-4-plus',
  });

  useEffect(() => {
    if (open) {
      void fetchLlmProviders().then(setProviders);
    }
  }, [open]);

  const handleSave = async () => {
    if (editing) {
      await updateLlmProvider(editing, formData);
    } else {
      await createLlmProvider(formData);
    }
    const updated = await fetchLlmProviders();
    setProviders(updated);
    setEditing(null);
    setFormData({ name: '', providerType: 'zhipu', apiKey: '', model: 'glm-4-plus' });
    onProviderChange();
  };

  const handleDelete = async (id: string) => {
    await deleteLlmProvider(id);
    const updated = await fetchLlmProviders();
    setProviders(updated);
    onProviderChange();
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultLlmProvider(id);
    const updated = await fetchLlmProviders();
    setProviders(updated);
    onProviderChange();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#17181b] border-l border-neutral-800 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-100">LLM 配置</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {providers.map(p => (
          <div key={p.id} className="p-3 bg-[#1e2025] rounded border border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-100">{p.name}</span>
              {p.isDefault && <span className="text-xs text-blue-400">默认</span>}
            </div>
            <div className="text-xs text-neutral-400 space-y-1">
              <div>{p.providerType} / {p.model}</div>
            </div>
            <div className="flex gap-2 mt-2">
              {!p.isDefault && (
                <Button size="sm" variant="secondary" onClick={() => handleSetDefault(p.id)}>
                  设为默认
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => handleDelete(p.id)}>
                删除
              </Button>
            </div>
          </div>
        ))}

        <div className="p-3 bg-[#1e2025] rounded border border-neutral-800 space-y-3">
          <Label>
            名称
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
          </Label>
          <Label>
            提供商
            <select
              value={formData.providerType}
              onChange={e => setFormData({ ...formData, providerType: e.target.value as LlmProviderType })}
              className="w-full px-3 py-2 bg-[#111214] border border-neutral-800 rounded text-sm"
            >
              <option value="zhipu">智谱 GLM</option>
              <option value="minimax">MiniMax</option>
              <option value="qwen">通义千问</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </Label>
          <Label>
            模型
            <select
              value={formData.model}
              onChange={e => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-3 py-2 bg-[#111214] border border-neutral-800 rounded text-sm"
            >
              {PRESET_MODELS[formData.providerType].map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Label>
          <Label>
            API Key
            <Input type="password" value={formData.apiKey} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} />
          </Label>
          <Button onClick={handleSave} className="w-full">
            {editing ? '更新' : '添加'}
          </Button>
        </div>
      </div>
    </div>
  );
}
