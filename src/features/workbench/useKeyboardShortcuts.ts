import { useEffect, useRef } from 'react';

import { resolveWorkbenchShortcutAction } from './workbenchShortcutModel';

type ShortcutHandlers = {
  onCloseActiveTab: () => void;
  onOpenNodeDashboard: () => void;
  onOpenNewConnection: () => void;
  onSwitchToTabIndex: (index: number) => void;
  onSwitchToPrevTab: () => void;
  onSwitchToNextTab: () => void;
  onToggleQuickConnect: () => void;
  onToggleCommandHistory: () => void;
  onToggleLlmSettings: () => void;
  onToggleAiAssistant: () => void;
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const handlersRef = useRef(handlers);

  // Keep ref up to date on every render so the effect closure always calls latest handlers
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in form fields
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const mod = isMac ? e.metaKey : e.ctrlKey;
      const action = resolveWorkbenchShortcutAction({ key: e.key, mod });

      if (action) {
        e.preventDefault();
      }

      switch (action) {
        case 'toggleQuickConnect':
          handlersRef.current.onToggleQuickConnect();
          return;
        case 'toggleCommandHistory':
          handlersRef.current.onToggleCommandHistory();
          return;
        case 'toggleLlmSettings':
          handlersRef.current.onToggleLlmSettings();
          return;
        case 'toggleAiAssistant':
          handlersRef.current.onToggleAiAssistant();
          return;
        case 'openNodeDashboard':
          handlersRef.current.onOpenNodeDashboard();
          return;
        case 'closeActiveTab':
          handlersRef.current.onCloseActiveTab();
          return;
        case 'openNewConnection':
          handlersRef.current.onOpenNewConnection();
          return;
        case 'switchToPrevTab':
          handlersRef.current.onSwitchToPrevTab();
          return;
        case 'switchToNextTab':
          handlersRef.current.onSwitchToNextTab();
          return;
        default: {
          if (!mod) return;

          const digit = parseInt(e.key, 10);
          if (digit >= 1 && digit <= 9) {
            e.preventDefault();
            handlersRef.current.onSwitchToTabIndex(digit - 1);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // single registration — handlers always current via ref
}
