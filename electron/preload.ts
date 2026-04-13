import { clipboard, contextBridge, ipcRenderer } from 'electron';

import { decodeRuntimeArgument } from './runtimeArgument.js';

const runtime = decodeRuntimeArgument(process.argv);

if (runtime) {
  contextBridge.exposeInMainWorld('__OPSCLAW_RUNTIME__', runtime);
}

contextBridge.exposeInMainWorld('__OPSCLAW_CLIPBOARD__', {
  readText: () => clipboard.readText(),
  writeText: (text: string) => {
    clipboard.writeText(text);
  },
});

contextBridge.exposeInMainWorld('__OPSCLAW_FILE_DIALOG__', {
  pickFiles: (options?: unknown) => ipcRenderer.invoke('opsclaw:file-dialog:open', options),
  pickSavePath: (options?: unknown) => ipcRenderer.invoke('opsclaw:file-dialog:save', options),
});
