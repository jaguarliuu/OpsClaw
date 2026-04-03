import type { OpsClawDesktopRuntime } from './types';

type DesktopWindowChromeLayoutInput = {
  runtime?: OpsClawDesktopRuntime;
  location: {
    protocol: string;
  };
};

type DesktopWindowChromeStyle = {
  paddingTop?: string;
  paddingRight?: string;
  WebkitAppRegion?: 'drag' | 'no-drag';
};

export function buildDesktopWindowChromeLayout(
  input: DesktopWindowChromeLayoutInput,
): {
  pageStyle: DesktopWindowChromeStyle | undefined;
  topBarStyle: DesktopWindowChromeStyle | undefined;
  interactiveStyle: DesktopWindowChromeStyle | undefined;
  windowControlsInsetStyle: DesktopWindowChromeStyle | undefined;
} {
  const isDesktop = input.runtime?.desktop === true || input.location.protocol === 'file:';
  if (!isDesktop) {
    return {
      pageStyle: undefined,
      topBarStyle: undefined,
      interactiveStyle: undefined,
      windowControlsInsetStyle: undefined,
    };
  }

  return {
    pageStyle: undefined,
    topBarStyle: {
      paddingTop: 'env(titlebar-area-height, 0px)',
      paddingRight: 'calc(env(titlebar-area-width, 138px) + 8px)',
      WebkitAppRegion: 'drag',
    },
    interactiveStyle: {
      WebkitAppRegion: 'no-drag',
    },
    windowControlsInsetStyle: {
      WebkitAppRegion: 'no-drag',
    },
  };
}
