import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useStreamingChat } from './useStreamingChat';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  providerId: string | null;
  onClose: () => void;
};

export function AiAssistantPanel({ open, providerId, onClose }: Props) {
  const [input, setInput] = useState('');
  const { messages, isStreaming, error, sendMessage, clearMessages } = useStreamingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !providerId || isStreaming) return;
    sendMessage(providerId, input.trim());
    setInput('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#17181b] border-l border-neutral-800 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-100">AI 助手</h2>
        <div className="flex gap-2">
          <button
            onClick={clearMessages}
            className="text-xs text-neutral-400 hover:text-neutral-100"
          >
            清空
          </button>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded text-sm ${
              msg.role === 'user'
                ? 'bg-blue-500/10 text-neutral-100 ml-8'
                : 'bg-[#1e2025] text-neutral-300 mr-8'
            }`}
          >
            <div className="text-xs text-neutral-500 mb-1">
              {msg.role === 'user' ? '你' : 'AI'}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-300">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-neutral-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入消息..."
            disabled={!providerId || isStreaming}
            className="flex-1 px-3 py-2 bg-[#111214] border border-neutral-800 rounded text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!providerId || isStreaming || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {!providerId && (
          <div className="text-xs text-neutral-500 mt-2">
            请先在 LLM 配置中添加并设置默认提供商
          </div>
        )}
      </div>
    </div>
  );
}
