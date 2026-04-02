import { contextBridge } from 'electron';

import { decodeRuntimeArgument } from './runtimeArgument.js';

const runtime = decodeRuntimeArgument(process.argv);

if (runtime) {
  contextBridge.exposeInMainWorld('__OPSCLAW_RUNTIME__', runtime);
}
