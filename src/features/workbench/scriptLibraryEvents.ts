export const SCRIPT_LIBRARY_CHANGED_EVENT = 'opsclaw:script-library-changed';

export type ScriptLibraryChangedDetail = {
  nodeId: string | null;
};

export function dispatchScriptLibraryChanged(detail: ScriptLibraryChangedDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ScriptLibraryChangedDetail>(SCRIPT_LIBRARY_CHANGED_EVENT, {
      detail,
    })
  );
}

export function isScriptLibraryChangeRelevant(
  detail: ScriptLibraryChangedDetail,
  sessionNodeId: string | null
) {
  if (detail.nodeId === null) {
    return true;
  }

  return detail.nodeId === sessionNodeId;
}

export function subscribeScriptLibraryChanged(
  listener: (detail: ScriptLibraryChangedDetail) => void
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<ScriptLibraryChangedDetail>).detail;
    listener(detail ?? { nodeId: null });
  };

  window.addEventListener(SCRIPT_LIBRARY_CHANGED_EVENT, handleChange as EventListener);

  return () => {
    window.removeEventListener(SCRIPT_LIBRARY_CHANGED_EVENT, handleChange as EventListener);
  };
}
