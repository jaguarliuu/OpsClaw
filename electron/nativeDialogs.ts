import type { BrowserWindow, OpenDialogReturnValue, SaveDialogReturnValue } from 'electron';

export type NativeOpenDialogResult = {
  canceled: boolean;
  paths: string[];
};

export type NativeSaveDialogResult = {
  canceled: boolean;
  path: string | null;
};

type NativeDialogOptions = Record<string, unknown>;

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
    paths: input.canceled ? [] : input.filePaths.filter((path) => path !== ''),
  };
}

export function normalizeSaveDialogResult(input: {
  canceled: boolean;
  filePath?: string | null;
}): NativeSaveDialogResult {
  return {
    canceled: input.canceled,
    path: input.canceled ? null : input.filePath ?? null,
  };
}

export function normalizeDialogOptions(options: unknown): NativeDialogOptions | undefined {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return undefined;
  }

  return options as NativeDialogOptions;
}

export function registerNativeDialogHandlers(
  getWindow: () => BrowserWindow | null,
  deps: NativeDialogRegistrarDeps
) {
  deps.ipcMain.handle('opsclaw:file-dialog:open', async (_event, options) => {
    const result = await deps.dialog.showOpenDialog(
      getWindow() ?? undefined,
      normalizeDialogOptions(options)
    );
    return normalizeOpenDialogResult(result);
  });

  deps.ipcMain.handle('opsclaw:file-dialog:save', async (_event, options) => {
    const result = await deps.dialog.showSaveDialog(
      getWindow() ?? undefined,
      normalizeDialogOptions(options)
    );
    return normalizeSaveDialogResult(result);
  });
}
