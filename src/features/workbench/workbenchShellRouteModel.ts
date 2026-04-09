export type WorkbenchShellRouteState = {
  keepWorkbenchMounted: boolean;
  showSettingsOverlay: boolean;
};

function normalizePathname(pathname: string) {
  if (pathname === '/') {
    return pathname;
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function buildWorkbenchShellRouteState(pathname: string): WorkbenchShellRouteState {
  const normalizedPathname = normalizePathname(pathname);
  const showSettingsOverlay = normalizedPathname === '/settings';

  return {
    keepWorkbenchMounted:
      normalizedPathname === '/' || showSettingsOverlay,
    showSettingsOverlay,
  };
}
