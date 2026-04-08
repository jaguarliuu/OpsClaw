export function toggleBooleanState(current: boolean) {
  return !current;
}

export function getPendingInteractionIndicatorVisible(count: number) {
  return count > 0;
}

export function formatPendingInteractionIndicatorLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

export const getPendingGateIndicatorVisible = getPendingInteractionIndicatorVisible;
export const formatPendingGateIndicatorLabel = formatPendingInteractionIndicatorLabel;

export function openOverlayState() {
  return true;
}

export function closeOverlayState() {
  return false;
}
