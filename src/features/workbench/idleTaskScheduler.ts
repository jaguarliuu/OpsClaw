type IdleTaskWindow = {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const IDLE_TASK_FALLBACK_DELAY_MS = 1500;

export function scheduleIdleTask(
  windowLike: IdleTaskWindow,
  task: () => void
): () => void {
  if (
    typeof windowLike.requestIdleCallback === 'function' &&
    typeof windowLike.cancelIdleCallback === 'function'
  ) {
    const idleCallbackId = windowLike.requestIdleCallback(() => {
      task();
    });

    return () => {
      windowLike.cancelIdleCallback?.(idleCallbackId);
    };
  }

  const timeoutId = windowLike.setTimeout(() => {
    task();
  }, IDLE_TASK_FALLBACK_DELAY_MS);

  return () => {
    windowLike.clearTimeout(timeoutId);
  };
}
