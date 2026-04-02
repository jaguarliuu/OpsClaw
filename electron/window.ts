import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BrowserWindow } from 'electron';

import type { OpsClawDesktopRuntime } from '../src/features/workbench/types.js';
import { encodeRuntimeArgument } from './runtimeArgument.js';
import { buildMainWindowOptions } from './windowOptions.js';

type CreateMainWindowInput = {
  indexHtmlPath?: string;
  preloadPath: string;
  rendererUrl?: string;
  runtime: OpsClawDesktopRuntime;
};

export async function createMainWindow(input: CreateMainWindowInput) {
  const window = new BrowserWindow(
    buildMainWindowOptions({
      platform: process.platform,
      preloadPath: input.preloadPath,
      runtimeArgument: encodeRuntimeArgument(input.runtime),
    }),
  );

  window.once('ready-to-show', () => {
    window.show();
  });

  if (input.rendererUrl) {
    await window.loadURL(input.rendererUrl);
    return window;
  }

  if (!input.indexHtmlPath) {
    throw new Error('缺少 renderer 入口路径。');
  }

  const fileUrl = pathToFileURL(path.resolve(input.indexHtmlPath));
  fileUrl.searchParams.set('opsclawDesktop', '1');
  fileUrl.searchParams.set('serverHttpBaseUrl', input.runtime.serverHttpBaseUrl);
  fileUrl.searchParams.set('serverWebSocketBaseUrl', input.runtime.serverWebSocketBaseUrl);
  await window.loadURL(fileUrl.toString());
  return window;
}
