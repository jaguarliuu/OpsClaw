import type { BrowserWindowConstructorOptions } from 'electron';

import {
  OPSCLAW_WINDOW_HEIGHT,
  OPSCLAW_WINDOW_WIDTH,
} from './constants.js';

type BuildMainWindowOptionsInput = {
  platform: NodeJS.Platform;
  preloadPath: string;
  runtimeArgument: string;
};

export function buildMainWindowOptions(
  input: BuildMainWindowOptionsInput,
): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    width: OPSCLAW_WINDOW_WIDTH,
    height: OPSCLAW_WINDOW_HEIGHT,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: input.preloadPath,
      additionalArguments: [input.runtimeArgument],
    },
  };

  if (input.platform === 'win32') {
    options.autoHideMenuBar = true;
    options.titleBarStyle = 'hidden';
    options.titleBarOverlay = {
      color: '#0a0a0a',
      symbolColor: '#f5f5f5',
      height: 36,
    };
  }

  return options;
}
