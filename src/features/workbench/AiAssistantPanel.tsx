import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useStreamingChat } from './useStreamingChat';
import { fetchLlmProviders } from './api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  open: boolean;
  onClose: () => void;
};

type ModelOption = {
  value: string; // "providerId:modelName"
  label: string;
  providerId: string;
  modelName: string;
};

export function AiAssistantPanel({ open, onClose }: Props) {
  const [input, setInput] = useState('');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const { messages, isStreaming, error, sendMessage, clearMessages } = useStreamingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      void fetchLlmProviders().then((list) => {
        const options: ModelOption[] = [];
        for (const provider of list) {
          for (const model of provider.models) {
            options.push({
              value: `${provider.id}:${model}`,
              label: `${provider.name} - ${model}`,
              providerId: provider.id,
              modelName: model,
            });
          }
        }
        setModelOptions(options);
        const defaultProvider = list.find(p => p.isDefault);
        if (defaultProvider && defaultProvider.models.length > 0) {
          setSelectedModel(`${defaultProvider.id}:${defaultProvider.models[0]}`);
        }
      });
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !selectedModel || isStreaming) return;
    const option = modelOptions.find(o => o.value === selectedModel);
    if (!option) return;
    sendMessage(option.providerId, option.modelName, input.trim());
    setInput('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[var(--app-bg-elevated2)] border-l border-[var(--app-border-default)] flex flex-col z-50 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)]">
        <h2 className="text-base font-semibold text-neutral-100">AI 助手</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={clearMessages}
            className="text-xs px-2 py-1 text-neutral-400 hover:text-neutral-100 hover:bg-[var(--app-bg-elevated3)] rounded transition-colors"
          >
            清空
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-[var(--app-bg-elevated3)] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="space-y-2">
              <div className="text-neutral-600 text-sm">开始与 AI 对话</div>
              <div className="text-neutral-700 text-xs">选择提供商和模型后即可开始</div>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--app-bg-elevated3)] text-neutral-200 border border-[var(--app-border-default)]'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide mb-1.5 opacity-60">
                {msg.role === 'user' ? '你' : 'AI'}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)]">
        <div className="border border-[var(--app-border-default)] rounded-lg bg-[var(--app-bg-base)] overflow-hidden">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="请输入你的问题，按 Enter 发送"
            disabled={!selectedModel || isStreaming}
            rows={4}
            className="w-full px-4 pt-4 pb-2 bg-transparent border-0 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between px-4 pb-3">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[200px] h-8 bg-[var(--app-bg-elevated2)] border-[var(--app-border-default)]">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleSend}
              disabled={!selectedModel || isStreaming || !input.trim()}
              className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        {isStreaming && (
          <div className="text-xs text-blue-400 mt-2">
            AI 正在回复...
          </div>
        )}
      </div>
    </div>
  );
}
