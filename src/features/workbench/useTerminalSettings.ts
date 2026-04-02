import { useContext } from 'react';

import {
  TerminalSettingsContext,
  type TerminalSettingsContextValue,
} from './terminalSettingsStore';

export function useTerminalSettings(): TerminalSettingsContextValue {
  const ctx = useContext(TerminalSettingsContext);
  if (!ctx) {
    throw new Error('useTerminalSettings must be used within TerminalSettingsProvider');
  }
  return ctx;
}
