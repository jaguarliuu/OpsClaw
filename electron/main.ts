import { app, dialog, ipcMain } from 'electron';

import {
  resolveRendererIndexHtmlPath,
  startBackendProcess,
  type StartedBackendProcess,
} from './backendProcess.js';
import { createFileLogger } from './fileLogger.js';
import { registerNativeDialogHandlers } from './nativeDialogs.js';
import { OPSCLAW_APP_NAME } from './constants.js';
import { resolveBackendLogFilePath, resolveMainLogFilePath } from './logPaths.js';
import { resolvePreloadPath } from './mainRuntimePaths.js';
import { createMainWindow } from './window.js';

let backendProcess: StartedBackendProcess | null = null;
let mainWindow: Awaited<ReturnType<typeof createMainWindow>> | null = null;
let quitting = false;
let logger: ReturnType<typeof createFileLogger> | null = null;
let nativeDialogHandlersRegistered = false;

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

async function stopBackendProcess() {
  if (!backendProcess) {
    return;
  }

  const current = backendProcess;
  backendProcess = null;
  await current.stop();
}

async function bootstrapDesktopApp() {
  if (!nativeDialogHandlersRegistered) {
    registerNativeDialogHandlers(() => mainWindow, { dialog, ipcMain });
    nativeDialogHandlersRegistered = true;
  }

  const dataDir = app.getPath('userData');
  logger = createFileLogger(resolveMainLogFilePath(dataDir));
  const resourcesPath = app.isPackaged ? process.resourcesPath : process.cwd();
  logger.info('bootstrap:start', {
    dataDir,
    isPackaged: app.isPackaged,
    resourcesPath,
  });
  backendProcess = await startBackendProcess({
    backendLogFilePath: resolveBackendLogFilePath(dataDir),
    cwd: process.cwd(),
    dataDir,
    isPackaged: app.isPackaged,
    resourcesPath,
  });
  logger.info('backend:ready', backendProcess.runtime);

  const preloadPath = resolvePreloadPath(import.meta.url);
  mainWindow = await createMainWindow({
    preloadPath,
    runtime: backendProcess.runtime,
    rendererUrl: app.isPackaged
      ? undefined
      : process.env.OPSCLAW_ELECTRON_RENDERER_URL ?? 'http://localhost:5173',
    indexHtmlPath: app.isPackaged
      ? resolveRendererIndexHtmlPath(process.resourcesPath)
      : undefined,
  });
  logger.info('window:ready', {
    preloadPath,
  });
}

async function showStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger?.error('startup:error', { message });
  dialog.showErrorBox(`${OPSCLAW_APP_NAME} 启动失败`, message);
  await stopBackendProcess();
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(bootstrapDesktopApp).catch(showStartupError);
}

app.on('before-quit', (event) => {
  if (quitting) {
    return;
  }

  quitting = true;
  event.preventDefault();
  void stopBackendProcess().finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    void bootstrapDesktopApp().catch(showStartupError);
    return;
  }

  focusMainWindow();
});
