import assert from 'node:assert/strict';
import test from 'node:test';

void test('buildDesktopWindowChromeLayout reserves the title bar overlay only inside top chrome for desktop pages', async () => {
  const { buildDesktopWindowChromeLayout } = await import('./desktopWindowChromeModel.js');

  assert.deepEqual(
    buildDesktopWindowChromeLayout({
      runtime: {
        desktop: true,
        serverHttpBaseUrl: 'http://127.0.0.1:48321',
        serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
      },
      location: { protocol: 'file:' },
    }),
    {
      pageStyle: undefined,
      topBarStyle: {
        paddingTop: 'env(titlebar-area-height, 0px)',
        paddingRight: '146px',
        WebkitAppRegion: 'drag',
      },
      interactiveStyle: {
        WebkitAppRegion: 'no-drag',
      },
      windowControlsInsetStyle: {
        WebkitAppRegion: 'no-drag',
      },
    }
  );
});

void test('buildDesktopPanelHeaderStyle keeps desktop side-panel actions clear of native window controls', async () => {
  const { buildDesktopPanelHeaderStyle } = await import('./desktopWindowChromeModel.js');

  assert.deepEqual(
    buildDesktopPanelHeaderStyle({
      runtime: {
        desktop: true,
        serverHttpBaseUrl: 'http://127.0.0.1:48321',
        serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
      },
      location: { protocol: 'file:' },
    }),
    {
      paddingTop: 'calc(0.75rem + env(titlebar-area-height, 0px))',
      paddingRight: 'calc(1rem + 146px)',
    }
  );
});

void test('buildDesktopPanelHeaderStyle leaves browser side panels unchanged', async () => {
  const { buildDesktopPanelHeaderStyle } = await import('./desktopWindowChromeModel.js');

  assert.equal(
    buildDesktopPanelHeaderStyle({
      runtime: undefined,
      location: { protocol: 'https:' },
    }),
    undefined
  );
});

void test('buildDesktopWindowChromeLayout leaves browser pages unchanged', async () => {
  const { buildDesktopWindowChromeLayout } = await import('./desktopWindowChromeModel.js');

  assert.deepEqual(
    buildDesktopWindowChromeLayout({
      runtime: undefined,
      location: { protocol: 'https:' },
    }),
    {
      pageStyle: undefined,
      topBarStyle: undefined,
      interactiveStyle: undefined,
      windowControlsInsetStyle: undefined,
    }
  );
});
