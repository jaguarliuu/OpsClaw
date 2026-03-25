import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DEFAULT_TERMINAL_SETTINGS,
  loadTerminalSettings,
  saveTerminalSettings,
} from './terminalSettings';
import type { TerminalSettings } from './terminalSettings';

type TerminalSettingsContextValue = {
  settings: TerminalSettings;
  updateSettings: (patch: Partial<TerminalSettings>) => void;
};

const TerminalSettingsContext = createContext<TerminalSettingsContextValue | null>(null);

export function TerminalSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TerminalSettings>(() => loadTerminalSettings());

  useEffect(() => {
    saveTerminalSettings(settings);
  }, [settings]);

  const updateSettings = (patch: Partial<TerminalSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return (
    <TerminalSettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}

export function useTerminalSettings(): TerminalSettingsContextValue {
  const ctx = useContext(TerminalSettingsContext);
  if (!ctx) {
    throw new Error('useTerminalSettings must be used within TerminalSettingsProvider');
  }
  return ctx;
}

export { DEFAULT_TERMINAL_SETTINGS };
