export function toggleBooleanState(current: boolean) {
  return !current;
}

export function getPendingGateIndicatorVisible(count: number) {
  return count > 0;
}

export function formatPendingGateIndicatorLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

export function openOverlayState() {
  return true;
}

export function closeOverlayState() {
  return false;
}
