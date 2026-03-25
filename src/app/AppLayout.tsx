import { Outlet } from 'react-router-dom';

import { TerminalSettingsProvider } from '@/features/workbench/TerminalSettingsContext';

export function AppLayout() {
  return (
    <TerminalSettingsProvider>
      <Outlet />
    </TerminalSettingsProvider>
  );
}
