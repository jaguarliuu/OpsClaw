import type { OpsClawDesktopRuntime } from './types';

const WINDOWS_TITLEBAR_CONTROLS_INSET_PX = '146px';

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

function isDesktopRuntime(input: DesktopWindowChromeLayoutInput) {
  return input.runtime?.desktop === true || input.location.protocol === 'file:';
}

export function buildDesktopWindowChromeLayout(
  input: DesktopWindowChromeLayoutInput,
): {
  pageStyle: DesktopWindowChromeStyle | undefined;
  topBarStyle: DesktopWindowChromeStyle | undefined;
  interactiveStyle: DesktopWindowChromeStyle | undefined;
  windowControlsInsetStyle: DesktopWindowChromeStyle | undefined;
} {
  if (!isDesktopRuntime(input)) {
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
      paddingRight: WINDOWS_TITLEBAR_CONTROLS_INSET_PX,
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

export function buildDesktopPanelHeaderStyle(
  input: DesktopWindowChromeLayoutInput
): Pick<DesktopWindowChromeStyle, 'paddingTop' | 'paddingRight' | 'WebkitAppRegion'> | undefined {
  if (!isDesktopRuntime(input)) {
    return undefined;
  }

  return {
    paddingTop: 'calc(0.75rem + env(titlebar-area-height, 0px))',
    paddingRight: `calc(1rem + ${WINDOWS_TITLEBAR_CONTROLS_INSET_PX})`,
    WebkitAppRegion: 'no-drag',
  };
}
