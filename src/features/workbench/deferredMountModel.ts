export function nextDeferredMountState(hasMounted: boolean, isOpen: boolean) {
  return hasMounted || isOpen;
}
