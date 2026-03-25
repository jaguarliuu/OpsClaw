import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TerminalSettingsTab } from '@/features/workbench/TerminalSettingsTab';
import { LlmSettings } from '@/features/workbench/LlmSettings';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('terminal');

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-neutral-100">
      <div className="border-b border-neutral-800/50 bg-[#111214]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 py-5">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="hover:bg-neutral-800/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">设置</h1>
              <p className="text-sm text-neutral-500 mt-0.5">配置终端和 AI 助手</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-[#17181b] border border-neutral-800/50 p-1.5">
            <TabsTrigger value="terminal" className="data-[state=active]:bg-[#1e2025] data-[state=active]:shadow-sm transition-all">
              终端配置
            </TabsTrigger>
            <TabsTrigger value="llm" className="data-[state=active]:bg-[#1e2025] data-[state=active]:shadow-sm transition-all">
              LLM 配置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="terminal" className="space-y-6 animate-in fade-in-50 duration-300">
            <TerminalSettingsTab />
          </TabsContent>

          <TabsContent value="llm" className="space-y-6 animate-in fade-in-50 duration-300">
            <LlmSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
