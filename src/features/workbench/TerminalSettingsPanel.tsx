import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTerminalSettings } from '@/features/workbench/useTerminalSettings';
import { buildSettingsPath } from '@/features/workbench/settingsNavigation';
import {
  DEFAULT_TERMINAL_SETTINGS,
  FONT_FAMILY_OPTIONS,
  TERMINAL_THEMES,
} from '@/features/workbench/terminalSettings';
import type { TerminalThemeName } from '@/features/workbench/terminalSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const THEME_NAMES: TerminalThemeName[] = [
  'OpsClaw Dark',
  'Dracula',
  'Catppuccin Mocha',
  'Solarized Dark',
  'Light',
];

type SettingsTab = 'appearance' | 'llm';

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
};

export function TerminalSettingsPanel({ open, onClose, initialTab = 'appearance' }: Props) {
  const navigate = useNavigate();
  const { settings, updateSettings } = useTerminalSettings();
  const [scrollbackRaw, setScrollbackRaw] = useState(String(settings.scrollback));
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[min(400px,100vw)] flex-col
                     border-l border-[var(--app-border-strong)] bg-[var(--app-bg-elevated)] shadow-2xl outline-none"
          onEscapeKeyDown={onClose}
        >
          {/* Header */}
          <div className="border-b border-[var(--app-border-default)]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[14px] font-semibold text-[var(--app-text-primary)]">设置</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-neutral-500 transition-colors hover:bg-[var(--app-bg-elevated3)] hover:text-neutral-300"
                title="关闭"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-5">
              <button
                type="button"
                onClick={() => setActiveTab('appearance')}
                className={cn(
                  'px-4 py-2 text-[13px] font-medium transition-colors border-b-2',
                  activeTab === 'appearance'
                    ? 'border-[var(--app-accent-primary)] text-[var(--app-text-primary)]'
                    : 'border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'
                )}
              >
                外观
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('llm')}
                className={cn(
                  'px-4 py-2 text-[13px] font-medium transition-colors border-b-2',
                  activeTab === 'llm'
                    ? 'border-[var(--app-accent-primary)] text-[var(--app-text-primary)]'
                    : 'border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'
                )}
              >
                LLM 配置
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-5 py-5">
            {activeTab === 'appearance' && (
            <div className="grid gap-7">

              {/* Color Theme */}
              <div className="grid gap-3">
                <Label className="text-[12px] uppercase tracking-wider text-neutral-500">配色主题</Label>
                <div className="grid grid-cols-1 gap-2">
                  {THEME_NAMES.map((name) => {
                    const theme = TERMINAL_THEMES[name];
                    const isActive = settings.themeName === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => updateSettings({ themeName: name })}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          isActive
                            ? 'border-blue-500 bg-[var(--app-bg-elevated3)]'
                            : 'border-[var(--app-border-default)] hover:border-[var(--app-border-strong)] hover:bg-neutral-900'
                        )}
                      >
                        {/* Color preview: show bg + 4 ANSI sample colors */}
                        <div
                          className="flex h-8 w-14 shrink-0 overflow-hidden rounded"
                          style={{ backgroundColor: theme.background }}
                        >
                          <div className="flex flex-col justify-center gap-0.5 px-1.5">
                            <div className="flex gap-0.5">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.red }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.green }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.yellow }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.blue }} />
                            </div>
                            <div className="flex gap-0.5">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.magenta }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.cyan }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.brightBlack }} />
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.foreground }} />
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-[var(--app-text-primary)]">{name}</div>
                          <div className="text-[11px] text-neutral-500">
                            bg {theme.background} · fg {theme.foreground}
                          </div>
                        </div>
                        {isActive && (
                          <svg className="h-4 w-4 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Family */}
              <div className="grid gap-2">
                <Label htmlFor="font-family" className="text-[12px] uppercase tracking-wider text-neutral-500">字体</Label>
                <Select
                  value={settings.fontFamily}
                  onValueChange={(value) => updateSettings({ fontFamily: value as typeof settings.fontFamily })}
                >
                  <SelectTrigger id="font-family" className="h-9 w-full rounded-md border border-[var(--app-border-strong)] bg-neutral-900 px-3 text-[13px] text-[var(--app-text-primary)]" title="选择字体">
                    <SelectValue placeholder="选择字体" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="font-size" className="text-[12px] uppercase tracking-wider text-neutral-500">字号</Label>
                  <span className="text-[13px] text-neutral-300">{settings.fontSize}px</span>
                </div>
                <input
                  id="font-size"
                  type="range"
                  min={10}
                  max={20}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                  title="字号"
                />
                <div className="flex justify-between text-[11px] text-neutral-600">
                  <span>10px</span><span>20px</span>
                </div>
              </div>

              {/* Line Height */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="line-height" className="text-[12px] uppercase tracking-wider text-neutral-500">行高</Label>
                  <span className="text-[13px] text-neutral-300">{settings.lineHeight.toFixed(2)}</span>
                </div>
                <input
                  id="line-height"
                  type="range"
                  min={1.0}
                  max={1.8}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(e) =>
                    updateSettings({
                      lineHeight: Math.round(parseFloat(e.target.value) * 100) / 100,
                    })
                  }
                  className="w-full accent-blue-500"
                  title="行高"
                />
                <div className="flex justify-between text-[11px] text-neutral-600">
                  <span>1.0</span><span>1.8</span>
                </div>
              </div>

              {/* Scrollback */}
              <div className="grid gap-2">
                <Label htmlFor="scrollback" className="text-[12px] uppercase tracking-wider text-neutral-500">滚动缓冲行数</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="scrollback"
                    type="number"
                    min={500}
                    max={50000}
                    value={scrollbackRaw}
                    onChange={(e) => setScrollbackRaw(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(scrollbackRaw, 10);
                      const clamped = Number.isNaN(parsed)
                        ? DEFAULT_TERMINAL_SETTINGS.scrollback
                        : Math.min(50000, Math.max(500, parsed));
                      setScrollbackRaw(String(clamped));
                      updateSettings({ scrollback: clamped });
                    }}
                    className="w-32"
                  />
                  <span className="text-[12px] text-neutral-600">500 – 50,000</span>
                </div>
              </div>

            </div>
            )}

            {activeTab === 'llm' && (
              <div className="grid gap-4">
                <div className="rounded-xl border border-[var(--app-border-default)] bg-[var(--app-bg-elevated3)] p-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-[var(--app-text-primary)]">
                      统一到设置页管理
                    </h3>
                    <p className="text-[13px] leading-6 text-[var(--app-text-secondary)]">
                      LLM 提供商、默认模型和后续 AI 底座配置都集中在设置页维护，workbench
                      里不再保留第二套配置界面。
                    </p>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={() => {
                      onClose();
                      void navigate(buildSettingsPath('llm'));
                    }}
                  >
                    前往统一配置页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
