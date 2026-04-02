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
};

export function buildDesktopWindowChromeLayout(
  input: DesktopWindowChromeLayoutInput,
): {
  pageStyle: DesktopWindowChromeStyle | undefined;
  topBarStyle: DesktopWindowChromeStyle | undefined;
  windowControlsInsetStyle: DesktopWindowChromeStyle | undefined;
} {
  const isDesktop = input.runtime?.desktop === true || input.location.protocol === 'file:';
  if (!isDesktop) {
    return {
      pageStyle: undefined,
      topBarStyle: undefined,
      windowControlsInsetStyle: undefined,
    };
  }

  return {
    pageStyle: undefined,
    topBarStyle: {
      paddingTop: 'env(titlebar-area-height, 0px)',
    },
    windowControlsInsetStyle: {
      paddingRight: '138px',
    },
  };
}
