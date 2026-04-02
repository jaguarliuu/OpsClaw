import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  APP_THEMES,
  loadTerminalSettings,
  saveTerminalSettings,
} from './terminalSettings';
import type { TerminalSettings } from './terminalSettings';
import { TerminalSettingsContext } from './terminalSettingsStore';

export function TerminalSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TerminalSettings>(() => loadTerminalSettings());
  const appTheme = APP_THEMES[settings.themeName];

  useEffect(() => {
    saveTerminalSettings(settings);
  }, [settings]);

  const updateSettings = (patch: Partial<TerminalSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return (
    <TerminalSettingsContext.Provider value={{ settings, appTheme, updateSettings }}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}
