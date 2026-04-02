import type { CSSProperties } from 'react';

export type SplitLayout = 'single' | 'horizontal' | 'vertical';
export type PaneSessionIds = [string | null, string | null];
export type FocusedPane = 0 | 1;
export type SessionRenderMode = 'single' | 'hidden' | 'pane';

export function buildSplitModeState(
  activeSessionId: string | null,
  sessionIds: string[],
  layout: Exclude<SplitLayout, 'single'>
) {
  const otherSessionId =
    sessionIds.find((sessionId) => sessionId !== activeSessionId) ?? null;

  return {
    splitLayout: layout,
    paneSessionIds: [activeSessionId, otherSessionId] as PaneSessionIds,
    focusedPane: 0 as FocusedPane,
  };
}

export function assignActiveSessionToPane(
  paneSessionIds: PaneSessionIds,
  focusedPane: FocusedPane,
  activeSessionId: string
) {
  const nextPaneSessionIds = [...paneSessionIds] as PaneSessionIds;
  nextPaneSessionIds[focusedPane] = activeSessionId;
  return nextPaneSessionIds;
}

export function cleanPaneSessionIds(
  paneSessionIds: PaneSessionIds,
  sessionIds: string[]
) {
  const sessionIdSet = new Set(sessionIds);
  return [
    paneSessionIds[0] && sessionIdSet.has(paneSessionIds[0]) ? paneSessionIds[0] : null,
    paneSessionIds[1] && sessionIdSet.has(paneSessionIds[1]) ? paneSessionIds[1] : null,
  ] as PaneSessionIds;
}

export function focusPaneState(
  paneSessionIds: PaneSessionIds,
  focusedPane: FocusedPane
) {
  return {
    focusedPane,
    selectedSessionId: paneSessionIds[focusedPane],
  };
}

export function buildPaneStyle(
  splitLayout: Exclude<SplitLayout, 'single'>,
  paneIndex: FocusedPane,
  splitRatio: number
): CSSProperties {
  if (splitLayout === 'horizontal') {
    return paneIndex === 0
      ? { position: 'absolute', top: 0, bottom: 0, left: 0, right: `calc(${(1 - splitRatio) * 100}% + 2px)` }
      : { position: 'absolute', top: 0, bottom: 0, right: 0, left: `calc(${splitRatio * 100}% + 2px)` };
  }

  return paneIndex === 0
    ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: `calc(${(1 - splitRatio) * 100}% + 2px)` }
    : { position: 'absolute', bottom: 0, left: 0, right: 0, top: `calc(${splitRatio * 100}% + 2px)` };
}

export function buildDividerStyle(
  splitLayout: Exclude<SplitLayout, 'single'>,
  splitRatio: number
): CSSProperties {
  if (splitLayout === 'horizontal') {
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: `calc(${splitRatio * 100}% - 2px)`,
      width: '4px',
    };
  }

  return {
    position: 'absolute',
    left: 0,
    right: 0,
    top: `calc(${splitRatio * 100}% - 2px)`,
    height: '4px',
  };
}

export function buildSessionRenderState(
  sessionId: string,
  splitLayout: SplitLayout,
  paneSessionIds: PaneSessionIds,
  focusedPane: FocusedPane
) {
  if (splitLayout === 'single') {
    return {
      renderMode: 'single' as SessionRenderMode,
      paneIndex: null,
      isFocusedPane: false,
    };
  }

  const paneIndex = paneSessionIds.indexOf(sessionId);
  if (paneIndex === -1) {
    return {
      renderMode: 'hidden' as SessionRenderMode,
      paneIndex: null,
      isFocusedPane: false,
    };
  }

  const normalizedPaneIndex: FocusedPane = paneIndex === 0 ? 0 : 1;
  return {
    renderMode: 'pane' as SessionRenderMode,
    paneIndex: normalizedPaneIndex,
    isFocusedPane: normalizedPaneIndex === focusedPane,
  };
}

export function listEmptyPaneIndexes(
  splitLayout: SplitLayout,
  paneSessionIds: PaneSessionIds
) {
  if (splitLayout === 'single') {
    return [];
  }

  return ([0, 1] as const).filter((paneIndex) => paneSessionIds[paneIndex] === null);
}
