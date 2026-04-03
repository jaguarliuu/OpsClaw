import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { clampContextMenuPosition } from '@/features/workbench/sessionTreeModel';
import {
  closeSshTerminalContextMenuState,
  openSshTerminalContextMenuState,
  shouldCloseSshTerminalContextMenuOnKeyDown,
  shouldCloseSshTerminalContextMenuOnPointerDown,
  type SshTerminalContextMenuPosition,
  type SshTerminalContextMenuState,
} from '@/features/workbench/sshTerminalContextMenuModel';

export function useSshTerminalContextMenu() {
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuState, setContextMenuState] = useState<SshTerminalContextMenuState | null>(null);

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) {
      return;
    }

    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const { x, y } = clampContextMenuPosition(
      { x: contextMenuState.x, y: contextMenuState.y },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight }
    );

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }, [contextMenuState]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = () => {
      setContextMenuState(closeSshTerminalContextMenuState());
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const isPointerInsideMenu =
        target instanceof Node && contextMenuRef.current?.contains(target) === true;

      if (shouldCloseSshTerminalContextMenuOnPointerDown(isPointerInsideMenu)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseSshTerminalContextMenuOnKeyDown(event.key)) {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuState]);

  const closeContextMenu = () => {
    setContextMenuState(closeSshTerminalContextMenuState());
  };

  const openContextMenu = (
    position: SshTerminalContextMenuPosition,
    options: {
      canCopySelection: boolean;
    }
  ) => {
    setContextMenuState(openSshTerminalContextMenuState(position, options));
  };

  return {
    closeContextMenu,
    contextMenuRef,
    contextMenuState,
    openContextMenu,
  };
}
