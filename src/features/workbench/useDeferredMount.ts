import { useEffect, useState } from 'react';

import { nextDeferredMountState } from './deferredMountModel';

export function useDeferredMount(isOpen: boolean) {
  const [hasMounted, setHasMounted] = useState(() => nextDeferredMountState(false, isOpen));

  useEffect(() => {
    setHasMounted((current) => nextDeferredMountState(current, isOpen));
  }, [isOpen]);

  return hasMounted;
}
