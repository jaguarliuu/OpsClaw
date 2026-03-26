import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTerminalSettings } from '@/features/workbench/TerminalSettingsContext';
import {
  DEFAULT_TERMINAL_SETTINGS,
  FONT_FAMILY_OPTIONS,
  TERMINAL_THEMES,
} from '@/features/workbench/terminalSettings';
import type { TerminalThemeName } from '@/features/workbench/terminalSettings';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const THEME_NAMES: TerminalThemeName[] = [
  'OpsClaw Dark',
  'Dracula',
  'Catppuccin Mocha',
  'Solarized Dark',
  'Light',
];

export function TerminalSettingsTab() {
  const { settings, updateSettings } = useTerminalSettings();
  const [scrollbackRaw, setScrollbackRaw] = useState(String(settings.scrollback));

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">配色主题</h3>
          <p className="text-sm text-neutral-500 mt-1">选择你喜欢的终端配色方案</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {THEME_NAMES.map((name) => {
            const theme = TERMINAL_THEMES[name];
            const isActive = settings.themeName === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => updateSettings({ themeName: name })}
                className={cn(
                  'group flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all duration-200',
                  isActive
                    ? 'border-blue-500/50 bg-[#1e2025] shadow-lg shadow-blue-500/5'
                    : 'border-neutral-800/50 hover:border-[var(--app-border-strong)]/50 hover:bg-[#17181b]'
                )}
              >
                <div
                  className="flex h-12 w-20 shrink-0 overflow-hidden rounded-lg shadow-sm"
                  style={{ backgroundColor: theme.background }}
                >
                  <div className="flex flex-col justify-center gap-1.5 px-2.5">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.red }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.green }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.yellow }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.blue }} />
                    </div>
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.magenta }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.cyan }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.brightBlack }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.foreground }} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-100">{name}</div>
                  <div className="text-xs text-neutral-500 mt-1 font-mono">
                    {theme.background} · {theme.foreground}
                  </div>
                </div>
                {isActive && (
                  <svg className="h-5 w-5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">显示设置</h3>
          <p className="text-sm text-neutral-500 mt-1">调整字体、大小和行为</p>
        </div>

        <div className="p-6 bg-[#17181b] rounded-xl border border-neutral-800/50 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="font-family" className="text-sm font-medium text-neutral-300">字体</Label>
            <Select value={settings.fontFamily} onValueChange={(v: string) => updateSettings({ fontFamily: v as typeof settings.fontFamily })}>
              <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all">
                <SelectValue />
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="font-size" className="text-sm font-medium text-neutral-300">字号</Label>
              <span className="text-sm font-mono text-blue-400">{settings.fontSize}px</span>
            </div>
            <input
              id="font-size"
              type="range"
              min={10}
              max={20}
              step={1}
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
              className="w-full h-2 bg-[var(--app-bg-elevated3)]/50 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
            />
            <div className="flex justify-between text-xs text-neutral-600">
              <span>10px</span><span>20px</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="line-height" className="text-sm font-medium text-neutral-300">行高</Label>
              <span className="text-sm font-mono text-blue-400">{settings.lineHeight.toFixed(2)}</span>
            </div>
            <input
              id="line-height"
              type="range"
              min={1.0}
              max={1.8}
              step={0.05}
              value={settings.lineHeight}
              onChange={(e) => updateSettings({ lineHeight: Math.round(parseFloat(e.target.value) * 100) / 100 })}
              className="w-full h-2 bg-[var(--app-bg-elevated3)]/50 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
            />
            <div className="flex justify-between text-xs text-neutral-600">
              <span>1.0</span><span>1.8</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scrollback" className="text-sm font-medium text-neutral-300">滚动缓冲行数</Label>
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
                className="w-32 h-10 bg-[#0a0b0d] border-neutral-800/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
              />
              <span className="text-xs text-neutral-500">500 – 50,000 行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
