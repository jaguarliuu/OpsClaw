import type { BrowserWindow, OpenDialogReturnValue, SaveDialogReturnValue } from 'electron';

export type NativeOpenDialogResult = {
  canceled: boolean;
  paths: string[];
};

export type NativeSaveDialogResult = {
  canceled: boolean;
  path: string | null;
};

type NativeDialogRegistrarDeps = {
  dialog: {
    showOpenDialog: (
      browserWindow: BrowserWindow | undefined,
      options?: unknown
    ) => Promise<OpenDialogReturnValue>;
    showSaveDialog: (
      browserWindow: BrowserWindow | undefined,
      options?: unknown
    ) => Promise<SaveDialogReturnValue>;
  };
  ipcMain: {
    handle: (
      channel: string,
      listener: (event: unknown, options: unknown) => Promise<unknown>
    ) => void;
  };
};

export function normalizeOpenDialogResult(input: {
  canceled: boolean;
  filePaths: string[];
}): NativeOpenDialogResult {
  return {
    canceled: input.canceled,
    paths: input.canceled
      ? []
      : input.filePaths.map((item) => item.trim()).filter(Boolean),
  };
}

export function normalizeSaveDialogResult(input: {
  canceled: boolean;
  filePath?: string | null;
}): NativeSaveDialogResult {
  return {
    canceled: input.canceled,
    path: input.canceled ? null : input.filePath?.trim() || null,
  };
}

export function registerNativeDialogHandlers(
  getWindow: () => BrowserWindow | null,
  deps: NativeDialogRegistrarDeps
) {
  deps.ipcMain.handle('opsclaw:file-dialog:open', async (_event, options) => {
    const result = await deps.dialog.showOpenDialog(getWindow() ?? undefined, options);
    return normalizeOpenDialogResult(result);
  });

  deps.ipcMain.handle('opsclaw:file-dialog:save', async (_event, options) => {
    const result = await deps.dialog.showSaveDialog(getWindow() ?? undefined, options);
    return normalizeSaveDialogResult(result);
  });
}
