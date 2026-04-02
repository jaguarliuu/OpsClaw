import { createContext } from 'react';

import type { AppTheme, TerminalSettings } from './terminalSettings';

export type TerminalSettingsContextValue = {
  settings: TerminalSettings;
  appTheme: AppTheme;
  updateSettings: (patch: Partial<TerminalSettings>) => void;
};

export const TerminalSettingsContext = createContext<TerminalSettingsContextValue | null>(null);
