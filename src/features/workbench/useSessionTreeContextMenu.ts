import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  clampContextMenuPosition,
} from '@/features/workbench/sessionTreeModel';
import {
  closeSessionTreeContextMenuState,
  openSessionTreeGroupContextMenuState,
  openSessionTreeProfileContextMenuState,
  openSessionTreeRootContextMenuState,
  shouldCloseSessionTreeContextMenuOnKeyDown,
  shouldCloseSessionTreeContextMenuOnPointerDown,
  type SessionTreeContextMenuPosition,
  type SessionTreeContextMenuState,
} from '@/features/workbench/sessionTreeContextMenuModel';
import type {
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';

export function useSessionTreeContextMenu() {
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuState, setContextMenuState] = useState<SessionTreeContextMenuState | null>(null);

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) return;

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
      setContextMenuState(closeSessionTreeContextMenuState());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const isPointerInsideMenu =
        target instanceof Node && contextMenuRef.current?.contains(target) === true;

      if (shouldCloseSessionTreeContextMenuOnPointerDown(isPointerInsideMenu)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseSessionTreeContextMenuOnKeyDown(event.key)) {
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
    setContextMenuState(closeSessionTreeContextMenuState());
  };

  const openRootContextMenu = (position: SessionTreeContextMenuPosition) => {
    setContextMenuState(openSessionTreeRootContextMenuState(position));
  };

  const openGroupContextMenu = (
    group: SavedConnectionGroup,
    position: SessionTreeContextMenuPosition
  ) => {
    setContextMenuState(openSessionTreeGroupContextMenuState(group, position));
  };

  const openProfileContextMenu = (
    profile: SavedConnectionProfile,
    position: SessionTreeContextMenuPosition
  ) => {
    setContextMenuState(openSessionTreeProfileContextMenuState(profile, position));
  };

  return {
    closeContextMenu,
    contextMenuRef,
    contextMenuState,
    openGroupContextMenu,
    openProfileContextMenu,
    openRootContextMenu,
  };
}
