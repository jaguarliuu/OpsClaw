import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignActiveSessionToPane,
  buildDividerStyle,
  buildPaneStyle,
  buildSessionRenderState,
  buildSplitModeState,
  cleanPaneSessionIds,
  focusPaneState,
  listEmptyPaneIndexes,
  type SplitLayout,
} from './workbenchTerminalWorkspaceModel.js';

void test('buildSplitModeState seeds panes from active and next available session', () => {
  assert.deepEqual(
    buildSplitModeState('session-1', ['session-1', 'session-2', 'session-3'], 'horizontal'),
    {
      splitLayout: 'horizontal' as SplitLayout,
      paneSessionIds: ['session-1', 'session-2'],
      focusedPane: 0 as const,
    }
  );
});

void test('buildSplitModeState keeps empty secondary pane when there is no other session', () => {
  assert.deepEqual(
    buildSplitModeState('session-1', ['session-1'], 'vertical'),
    {
      splitLayout: 'vertical' as SplitLayout,
      paneSessionIds: ['session-1', null],
      focusedPane: 0 as const,
    }
  );
});

void test('assignActiveSessionToPane writes the active session into the focused pane', () => {
  assert.deepEqual(assignActiveSessionToPane(['session-1', 'session-2'], 1, 'session-3'), [
    'session-1',
    'session-3',
  ]);
});

void test('cleanPaneSessionIds removes panes whose sessions were closed', () => {
  assert.deepEqual(cleanPaneSessionIds(['session-1', 'session-2'], ['session-2']), [
    null,
    'session-2',
  ]);
});

void test('focusPaneState returns the next focused pane and selected session id', () => {
  assert.deepEqual(focusPaneState(['session-1', 'session-2'], 1), {
    focusedPane: 1 as const,
    selectedSessionId: 'session-2',
  });
});

void test('buildPaneStyle returns horizontal pane geometry', () => {
  assert.deepEqual(buildPaneStyle('horizontal', 0, 0.25), {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 'calc(75% + 2px)',
  });
});

void test('buildPaneStyle returns vertical pane geometry', () => {
  assert.deepEqual(buildPaneStyle('vertical', 1, 0.25), {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 'calc(25% + 2px)',
  });
});

void test('buildDividerStyle returns horizontal divider geometry', () => {
  assert.deepEqual(buildDividerStyle('horizontal', 0.25), {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 'calc(25% - 2px)',
    width: '4px',
  });
});

void test('buildDividerStyle returns vertical divider geometry', () => {
  assert.deepEqual(buildDividerStyle('vertical', 0.25), {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 'calc(25% - 2px)',
    height: '4px',
  });
});

void test('buildSessionRenderState keeps all sessions visible in single layout', () => {
  assert.deepEqual(
    buildSessionRenderState('session-1', 'single', ['session-1', 'session-2'], 0),
    {
      renderMode: 'single',
      paneIndex: null,
      isFocusedPane: false,
    }
  );
});

void test('buildSessionRenderState marks non-pane sessions as hidden in split layout', () => {
  assert.deepEqual(
    buildSessionRenderState('session-3', 'horizontal', ['session-1', 'session-2'], 0),
    {
      renderMode: 'hidden',
      paneIndex: null,
      isFocusedPane: false,
    }
  );
});

void test('buildSessionRenderState marks pane sessions and focused pane in split layout', () => {
  assert.deepEqual(
    buildSessionRenderState('session-2', 'vertical', ['session-1', 'session-2'], 1),
    {
      renderMode: 'pane',
      paneIndex: 1,
      isFocusedPane: true,
    }
  );
});

void test('listEmptyPaneIndexes returns no placeholders in single layout', () => {
  assert.deepEqual(listEmptyPaneIndexes('single', ['session-1', null]), []);
});

void test('listEmptyPaneIndexes returns empty split panes only', () => {
  assert.deepEqual(listEmptyPaneIndexes('horizontal', ['session-1', null]), [1]);
  assert.deepEqual(listEmptyPaneIndexes('vertical', [null, null]), [0, 1]);
});
