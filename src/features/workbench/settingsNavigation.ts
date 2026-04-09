export const SETTINGS_PAGE_TABS = ['terminal', 'llm', 'memory', 'scripts'] as const;

export type SettingsPageTab = (typeof SETTINGS_PAGE_TABS)[number];

const SETTINGS_PAGE_PATH = '/settings';

export function isSettingsPageTab(tab: string): tab is SettingsPageTab {
  return SETTINGS_PAGE_TABS.includes(tab as SettingsPageTab);
}

export function buildSettingsPath(tab?: SettingsPageTab): string {
  if (!tab || tab === 'terminal') {
    return SETTINGS_PAGE_PATH;
  }

  return `${SETTINGS_PAGE_PATH}?tab=${tab}`;
}

export function resolveSettingsTab(searchParams: URLSearchParams): SettingsPageTab {
  const tab = searchParams.get('tab');

  if (tab && isSettingsPageTab(tab)) {
    return tab;
  }

  return 'terminal';
}
