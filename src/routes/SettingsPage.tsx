import { Suspense, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildDesktopWindowChromeLayout } from '@/features/workbench/desktopWindowChromeModel';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
} from '@/features/workbench/settingsTheme';
import {
  buildSettingsPath,
  isSettingsPageTab,
  resolveSettingsTab,
} from '@/features/workbench/settingsNavigation';
import { useDeferredMount } from '@/features/workbench/useDeferredMount';
import {
  LazyLlmSettings,
  LazyMemorySettings,
  LazyScriptSettingsTab,
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
  const shouldRenderScriptsTab = useDeferredMount(activeTab === 'scripts');

  const handleTabChange = (nextTab: string) => {
    if (!isSettingsPageTab(nextTab)) {
      return;
    }

    void navigate(buildSettingsPath(nextTab), { replace: true });
  };

  const settingsTabClassName =
    'text-[var(--app-text-secondary)] data-[state=active]:bg-[var(--app-bg-elevated3)] data-[state=active]:text-[var(--app-text-primary)] data-[state=active]:shadow-sm transition-all';

  return (
    <div className="min-h-screen bg-[var(--app-bg-base)] text-[var(--app-text-primary)]">
      <div className="sticky top-0 z-10 border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated)]/95 backdrop-blur-sm">
        <div
          className="mx-auto max-w-6xl px-8 py-5"
          style={desktopWindowChrome.topBarStyle}
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void navigate('/');
              }}
              className="transition-colors hover:bg-[var(--app-bg-elevated3)]"
              style={desktopWindowChrome.interactiveStyle}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">设置</h1>
              <p className={`mt-0.5 max-w-2xl text-sm leading-relaxed ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                统一管理终端、LLM、记忆和脚本能力
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-8 py-8">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-8">
          <TabsList
            className={`${SETTINGS_PANEL_CLASS} p-1.5`}
            style={desktopWindowChrome.interactiveStyle}
          >
            <TabsTrigger
              value="terminal"
              className={settingsTabClassName}
              style={desktopWindowChrome.interactiveStyle}
            >
              终端配置
            </TabsTrigger>
            <TabsTrigger
              value="llm"
              className={settingsTabClassName}
              style={desktopWindowChrome.interactiveStyle}
            >
              LLM 配置
            </TabsTrigger>
            <TabsTrigger
              value="memory"
              className={settingsTabClassName}
              style={desktopWindowChrome.interactiveStyle}
            >
              记忆文档
            </TabsTrigger>
            <TabsTrigger
              value="scripts"
              className={settingsTabClassName}
              style={desktopWindowChrome.interactiveStyle}
            >
              脚本
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

          <TabsContent
            value="scripts"
            forceMount={shouldRenderScriptsTab ? true : undefined}
            className="space-y-6 animate-in fade-in-50 duration-300"
          >
            {shouldRenderScriptsTab ? (
              <Suspense fallback={null}>
                <LazyScriptSettingsTab />
              </Suspense>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
