import { useState } from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
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

const THEME_NAMES: TerminalThemeName[] = [
  'OpsClaw Dark',
  'Dracula',
  'Catppuccin Mocha',
  'Solarized Dark',
  'Light',
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TerminalSettingsPanel({ open, onClose }: Props) {
  const { settings, updateSettings } = useTerminalSettings();
  const [scrollbackRaw, setScrollbackRaw] = useState(String(settings.scrollback));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[min(400px,100vw)] flex-col
                     border-l border-neutral-700 bg-[#141519] shadow-2xl outline-none"
          onEscapeKeyDown={onClose}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-neutral-100">终端显示设置</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-5 py-5">
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
                            ? 'border-blue-500 bg-neutral-800'
                            : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
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
                          <div className="text-[13px] font-medium text-neutral-100">{name}</div>
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
                <select
                  id="font-family"
                  value={settings.fontFamily}
                  onChange={(e) =>
                    updateSettings({ fontFamily: e.target.value as typeof settings.fontFamily })
                  }
                  className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900
                             px-3 text-[13px] text-neutral-100 outline-none
                             focus:border-neutral-500"
                >
                  {FONT_FAMILY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
