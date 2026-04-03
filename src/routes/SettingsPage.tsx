import { Suspense, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { buildDesktopWindowChromeLayout } from '@/features/workbench/desktopWindowChromeModel';
import {
  buildSettingsPath,
  resolveSettingsTab,
  type SettingsPageTab,
} from '@/features/workbench/settingsNavigation';
import { useDeferredMount } from '@/features/workbench/useDeferredMount';
import {
  LazyLlmSettings,
  LazyMemorySettings,
  LazyTerminalSettingsTab,
} from '@/routes/settingsLazyTabs';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const desktopWindowChrome = buildDesktopWindowChromeLayout({
    runtime: window.__OPSCLAW_RUNTIME__,
    location: window.location,
  });
  const activeTab = useMemo(
    () => resolveSettingsTab(searchParams),
    [searchParams]
  );
  const shouldRenderTerminalTab = useDeferredMount(activeTab === 'terminal');
  const shouldRenderLlmTab = useDeferredMount(activeTab === 'llm');
  const shouldRenderMemoryTab = useDeferredMount(activeTab === 'memory');

  const handleTabChange = (nextTab: string) => {
    void navigate(buildSettingsPath(nextTab as SettingsPageTab), { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-neutral-100">
      <div className="border-b border-neutral-800/50 bg-[#111214]/80 backdrop-blur-sm sticky top-0 z-10">
        <div
          className="max-w-6xl mx-auto px-8 py-5"
          style={desktopWindowChrome.topBarStyle}
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void navigate('/');
              }}
              className="hover:bg-neutral-800/50 transition-colors"
              style={desktopWindowChrome.interactiveStyle}
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
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-8">
          <TabsList className="bg-[#17181b] border border-neutral-800/50 p-1.5" style={desktopWindowChrome.interactiveStyle}>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-[#1e2025] data-[state=active]:shadow-sm transition-all" style={desktopWindowChrome.interactiveStyle}>
              终端配置
            </TabsTrigger>
            <TabsTrigger value="llm" className="data-[state=active]:bg-[#1e2025] data-[state=active]:shadow-sm transition-all" style={desktopWindowChrome.interactiveStyle}>
              LLM 配置
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-[#1e2025] data-[state=active]:shadow-sm transition-all" style={desktopWindowChrome.interactiveStyle}>
              记忆文档
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="terminal"
            forceMount={shouldRenderTerminalTab ? true : undefined}
            className="space-y-6 animate-in fade-in-50 duration-300"
          >
            {shouldRenderTerminalTab ? (
              <Suspense fallback={null}>
                <LazyTerminalSettingsTab />
              </Suspense>
            ) : null}
          </TabsContent>

          <TabsContent
            value="llm"
            forceMount={shouldRenderLlmTab ? true : undefined}
            className="space-y-6 animate-in fade-in-50 duration-300"
          >
            {shouldRenderLlmTab ? (
              <Suspense fallback={null}>
                <LazyLlmSettings />
              </Suspense>
            ) : null}
          </TabsContent>

          <TabsContent
            value="memory"
            forceMount={shouldRenderMemoryTab ? true : undefined}
            className="space-y-6 animate-in fade-in-50 duration-300"
          >
            {shouldRenderMemoryTab ? (
              <Suspense fallback={null}>
                <LazyMemorySettings />
              </Suspense>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
