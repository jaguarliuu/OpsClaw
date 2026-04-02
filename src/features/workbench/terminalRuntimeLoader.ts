export type TerminalRuntime = {
  Terminal: typeof import('@xterm/xterm').Terminal;
  FitAddon: typeof import('@xterm/addon-fit').FitAddon;
  SearchAddon: typeof import('@xterm/addon-search').SearchAddon;
};

let terminalRuntimePromise: Promise<TerminalRuntime> | null = null;

async function importTerminalRuntime(): Promise<TerminalRuntime> {
  await import('@xterm/xterm/css/xterm.css');

  const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-search'),
  ]);

  return {
    Terminal,
    FitAddon,
    SearchAddon,
  };
}

export function loadTerminalRuntime(
  load: () => Promise<TerminalRuntime> = importTerminalRuntime
): Promise<TerminalRuntime> {
  if (!terminalRuntimePromise) {
    terminalRuntimePromise = load();
  }

  return terminalRuntimePromise;
}

export function resetTerminalRuntimeLoaderForTest() {
  terminalRuntimePromise = null;
}
