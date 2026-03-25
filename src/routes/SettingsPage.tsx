import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/ui/SectionCard';
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

export function SettingsPage() {
  const { settings, updateSettings } = useTerminalSettings();
  const [scrollbackRaw, setScrollbackRaw] = useState(String(settings.scrollback));

  return (
    <div className="min-h-screen bg-[#141517] p-4">
      <div className="mb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          返回工作台
        </Link>
      </div>
      <SectionCard
        title="Terminal Display"
        description="Font, colors, and scrollback settings applied to all terminal sessions in real time."
      >
        <div className="grid gap-6 py-2">

          {/* Color Theme */}
          <div className="grid gap-2">
            <Label>Color Theme</Label>
            <div className="flex flex-wrap gap-3">
              {THEME_NAMES.map((name) => {
                const theme = TERMINAL_THEMES[name];
                const isActive = settings.themeName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => updateSettings({ themeName: name })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
                      isActive
                        ? 'border-blue-500 bg-neutral-800'
                        : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                    )}
                  >
                    <span
                      className="h-8 w-14 rounded"
                      style={{ backgroundColor: theme.background, border: `2px solid ${theme.cursor}` }}
                    />
                    <span className="text-[11px] text-neutral-400">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Family */}
          <div className="grid gap-2">
            <Label htmlFor="font-family">Font Family</Label>
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
              <Label htmlFor="font-size">Font Size</Label>
              <span className="text-[12px] text-neutral-400">{settings.fontSize}px</span>
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
              <span>10px</span>
              <span>20px</span>
            </div>
          </div>

          {/* Line Height */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="line-height">Line Height</Label>
              <span className="text-[12px] text-neutral-400">{settings.lineHeight.toFixed(2)}</span>
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
              <span>1.0</span>
              <span>1.8</span>
            </div>
          </div>

          {/* Scrollback */}
          <div className="grid gap-2">
            <Label htmlFor="scrollback">Scrollback Lines</Label>
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
                className="w-36"
              />
              <span className="text-[12px] text-neutral-500">500 – 50,000</span>
            </div>
          </div>

        </div>
      </SectionCard>
    </div>
  );
}
