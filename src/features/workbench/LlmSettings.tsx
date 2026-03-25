import { useEffect, useState } from 'react';
import type { LlmProvider, LlmProviderType } from './types';
import { fetchLlmProviders, createLlmProvider, updateLlmProvider, deleteLlmProvider, setDefaultLlmProvider } from './api';
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

export function LlmSettings() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    providerType: 'zhipu' as LlmProviderType,
    apiKey: '',
    model: 'glm-4-plus',
  });

  useEffect(() => {
    void fetchLlmProviders().then(setProviders);
  }, []);

  const handleSave = async () => {
    if (editing) {
      await updateLlmProvider(editing, formData);
    } else {
      const newProvider = await createLlmProvider(formData);
      if (providers.length === 0) {
        await setDefaultLlmProvider(newProvider.id);
      }
    }
    const updated = await fetchLlmProviders();
    setProviders(updated);
    setEditing(null);
    setFormData({ name: '', providerType: 'zhipu', apiKey: '', model: 'glm-4-plus' });
  };

  const handleDelete = async (id: string) => {
    await deleteLlmProvider(id);
    setProviders(await fetchLlmProviders());
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultLlmProvider(id);
    setProviders(await fetchLlmProviders());
  };

  const handleEdit = (provider: LlmProvider) => {
    setEditing(provider.id);
    setFormData({
      name: provider.name,
      providerType: provider.providerType,
      apiKey: provider.apiKey,
      model: provider.model,
    });
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setFormData({ name: '', providerType: 'zhipu', apiKey: '', model: 'glm-4-plus' });
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">已配置的提供商</h3>
          <p className="text-sm text-neutral-500 mt-1">管理你的 LLM 服务提供商配置</p>
        </div>
        {providers.length === 0 ? (
          <div className="text-sm text-neutral-400 py-12 text-center border border-dashed border-neutral-800/50 rounded-xl bg-[#0a0b0d]/30">
            <div className="text-neutral-600 mb-2">暂无配置</div>
            <div className="text-xs text-neutral-600">请在下方添加 LLM 提供商</div>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map(p => (
              <div key={p.id} className="group p-5 bg-[#17181b] rounded-xl border border-neutral-800/50 hover:border-neutral-700/50 transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-neutral-100 truncate">{p.name}</span>
                      {p.isDefault && (
                        <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-md border border-blue-500/20 font-medium">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="px-2 py-0.5 bg-neutral-800/50 rounded">{p.providerType}</span>
                      <span className="text-neutral-700">·</span>
                      <span className="font-mono">{p.model}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {!p.isDefault && (
                      <Button size="sm" variant="secondary" onClick={() => handleSetDefault(p.id)} className="h-8 text-xs">
                        设为默认
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => handleEdit(p)} className="h-8 text-xs">
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="h-8 text-xs hover:text-red-400 hover:bg-red-500/10">
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">{editing ? '编辑提供商' : '添加新提供商'}</h3>
          <p className="text-sm text-neutral-500 mt-1">
            {editing ? '修改提供商配置信息' : '配置新的 LLM 服务提供商'}
          </p>
        </div>
        <div className="p-6 bg-[#17181b] rounded-xl border border-neutral-800/50 space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-neutral-300">名称</Label>
            <Input
              placeholder="例如：我的智谱 GLM"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-neutral-300">提供商</Label>
            <Select
              value={formData.providerType}
              onValueChange={(v: string) => setFormData({ ...formData, providerType: v as LlmProviderType, model: PRESET_MODELS[v as LlmProviderType][0].value })}
            >
              <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zhipu">智谱 GLM</SelectItem>
                <SelectItem value="minimax">MiniMax</SelectItem>
                <SelectItem value="qwen">通义千问</SelectItem>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-neutral-300">模型</Label>
            <Input
              placeholder="例如：glm-4-plus"
              value={formData.model}
              onChange={e => setFormData({ ...formData, model: e.target.value })}
              className="h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono text-sm"
            />
            <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
              <span>常用：</span>
              {PRESET_MODELS[formData.providerType].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, model: m.value })}
                  className="px-2 py-1 bg-neutral-800/30 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 rounded transition-all duration-150 font-mono"
                >
                  {m.value}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-neutral-300">API Key</Label>
            <Input
              type="password"
              placeholder="输入 API Key"
              value={formData.apiKey}
              onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              className="h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono text-sm"
            />
          </div>

          <div className="flex gap-3 pt-2">
            {editing && (
              <Button onClick={handleCancelEdit} variant="secondary" className="flex-1 h-10 hover:bg-neutral-800 transition-colors">
                取消
              </Button>
            )}
            <Button onClick={handleSave} disabled={!formData.name || !formData.apiKey || !formData.model} className="flex-1 h-10 bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {editing ? '保存' : '添加提供商'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
