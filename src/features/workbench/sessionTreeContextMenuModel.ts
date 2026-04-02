import type {
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';

export type SessionTreeContextMenuPosition = {
  x: number;
  y: number;
};

export type SessionTreeContextMenuState =
  | {
      type: 'root';
      x: number;
      y: number;
    }
  | {
      type: 'group';
      group: SavedConnectionGroup;
      x: number;
      y: number;
    }
  | {
      type: 'profile';
      profile: SavedConnectionProfile;
      x: number;
      y: number;
    };

export function openSessionTreeRootContextMenuState(
  position: SessionTreeContextMenuPosition
): SessionTreeContextMenuState {
  return {
    type: 'root',
    x: position.x,
    y: position.y,
  };
}

export function openSessionTreeGroupContextMenuState(
  group: SavedConnectionGroup,
  position: SessionTreeContextMenuPosition
): SessionTreeContextMenuState {
  return {
    type: 'group',
    group,
    x: position.x,
    y: position.y,
  };
}

export function openSessionTreeProfileContextMenuState(
  profile: SavedConnectionProfile,
  position: SessionTreeContextMenuPosition
): SessionTreeContextMenuState {
  return {
    type: 'profile',
    profile,
    x: position.x,
    y: position.y,
  };
}

export function closeSessionTreeContextMenuState() {
  return null;
}

export function shouldCloseSessionTreeContextMenuOnPointerDown(
  isPointerInsideMenu: boolean
) {
  return !isPointerInsideMenu;
}

export function shouldCloseSessionTreeContextMenuOnKeyDown(key: string) {
  return key === 'Escape';
}
