import { clipboard, contextBridge } from 'electron';

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
