import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';

import { TerminalSettingsProvider, useTerminalSettings } from '@/features/workbench/TerminalSettingsContext';

function AppThemeApplier() {
  const { appTheme } = useTerminalSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-bg-base', appTheme.bg.base);
    root.style.setProperty('--app-bg-elevated', appTheme.bg.elevated);
    root.style.setProperty('--app-bg-elevated2', appTheme.bg.elevated2);
    root.style.setProperty('--app-bg-elevated3', appTheme.bg.elevated3);
    root.style.setProperty('--app-text-primary', appTheme.text.primary);
    root.style.setProperty('--app-text-secondary', appTheme.text.secondary);
    root.style.setProperty('--app-text-tertiary', appTheme.text.tertiary);
    root.style.setProperty('--app-border-default', appTheme.border.default);
    root.style.setProperty('--app-border-strong', appTheme.border.strong);
    root.style.setProperty('--app-accent-primary', appTheme.accent.primary);
    root.style.setProperty('--app-accent-primary-hover', appTheme.accent.primaryHover);
    root.style.setProperty('--app-status-success', appTheme.status.success);
    root.style.setProperty('--app-status-warning', appTheme.status.warning);
    root.style.setProperty('--app-status-error', appTheme.status.error);
    root.setAttribute('data-theme-mode', appTheme.mode);
  }, [appTheme]);

  return null;
}

export function AppLayout() {
  return (
    <TerminalSettingsProvider>
      <AppThemeApplier />
      <Outlet />
    </TerminalSettingsProvider>
  );
}
