export type WorkbenchShortcutAction =
  | 'toggleQuickConnect'
  | 'toggleCommandHistory'
  | 'toggleLlmSettings'
  | 'toggleAiAssistant'
  | 'closeActiveTab'
  | 'openNewConnection'
  | 'switchToPrevTab'
  | 'switchToNextTab';

export function resolveWorkbenchShortcutAction(input: { key: string; mod: boolean }) {
  if (!input.mod) {
    return null;
  }

  switch (input.key) {
    case 'k':
      return 'toggleQuickConnect' as const;
    case 'r':
      return 'toggleCommandHistory' as const;
    case 'l':
      return 'toggleLlmSettings' as const;
    case 'a':
      return 'toggleAiAssistant' as const;
    case 'w':
      return 'closeActiveTab' as const;
    case 't':
      return 'openNewConnection' as const;
    case '[':
      return 'switchToPrevTab' as const;
    case ']':
      return 'switchToNextTab' as const;
    default:
      return null;
  }
}

export function formatWorkbenchShortcutLabel(
  action: WorkbenchShortcutAction,
  isMac: boolean
) {
  switch (action) {
    case 'toggleAiAssistant':
      return isMac ? '⌘A' : 'Ctrl+A';
    case 'toggleQuickConnect':
      return isMac ? '⌘K' : 'Ctrl+K';
    case 'toggleCommandHistory':
      return isMac ? '⌘R' : 'Ctrl+R';
    case 'toggleLlmSettings':
      return isMac ? '⌘L' : 'Ctrl+L';
    case 'openNewConnection':
      return isMac ? '⌘T' : 'Ctrl+T';
    case 'closeActiveTab':
      return isMac ? '⌘W' : 'Ctrl+W';
    case 'switchToPrevTab':
      return isMac ? '⌘[' : 'Ctrl+[';
    case 'switchToNextTab':
      return isMac ? '⌘]' : 'Ctrl+]';
    default:
      return '';
  }
}
