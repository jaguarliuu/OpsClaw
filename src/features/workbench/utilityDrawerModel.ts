export type UtilityDrawerAction = 'open' | 'close' | 'toggle';

export function getDefaultUtilityDrawerOpenState() {
  return false;
}

export function nextUtilityDrawerOpenState(
  current: boolean,
  action: UtilityDrawerAction
) {
  if (action === 'open') {
    return true;
  }

  if (action === 'close') {
    return false;
  }

  return !current;
}

export function getWorkbenchContentGridClassName(isUtilityDrawerOpen: boolean) {
  return isUtilityDrawerOpen
    ? 'grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]'
    : 'grid min-w-0 flex-1 grid-cols-1';
}
