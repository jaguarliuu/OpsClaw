import { useEffect, useRef } from 'react';

type ShortcutHandlers = {
  onCloseActiveTab: () => void;
  onOpenNewConnection: () => void;
  onSwitchToTabIndex: (index: number) => void;
  onSwitchToPrevTab: () => void;
  onSwitchToNextTab: () => void;
  onToggleQuickConnect: () => void;
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
      if (!mod) return;

      switch (e.key) {
        case 'k':
          e.preventDefault();
          handlersRef.current.onToggleQuickConnect();
          break;
        case 'w':
          e.preventDefault();
          handlersRef.current.onCloseActiveTab();
          break;
        case 't':
          e.preventDefault();
          handlersRef.current.onOpenNewConnection();
          break;
        case '[':
          e.preventDefault();
          handlersRef.current.onSwitchToPrevTab();
          break;
        case ']':
          e.preventDefault();
          handlersRef.current.onSwitchToNextTab();
          break;
        default: {
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
