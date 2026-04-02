import type { SavedConnectionGroup, SavedConnectionProfile } from './types';

export type GroupDialogState = {
  mode: 'create' | 'rename' | null;
  target: SavedConnectionGroup | null;
  name: string;
  error: string | null;
};

export type MoveProfileDialogState = {
  profile: SavedConnectionProfile | null;
  targetGroupId: string | null;
  error: string | null;
};

export type DeleteGroupDialogState = {
  pendingDeleteGroup: SavedConnectionGroup | null;
  error: string | null;
};

export function buildCreateGroupDialogState(): GroupDialogState {
  return {
    error: null,
    mode: 'create',
    name: '',
    target: null,
  };
}

export function buildRenameGroupDialogState(
  group: SavedConnectionGroup
): GroupDialogState {
  return {
    error: null,
    mode: 'rename',
    name: group.name,
    target: group,
  };
}

export function clearGroupDialogState(): GroupDialogState {
  return {
    error: null,
    mode: null,
    name: '',
    target: null,
  };
}

export function buildMoveProfileDialogState(
  profile: SavedConnectionProfile,
  defaultGroupId: string | null
): MoveProfileDialogState {
  return {
    error: null,
    profile,
    targetGroupId: profile.groupId ?? defaultGroupId,
  };
}

export function clearMoveProfileDialogState(): MoveProfileDialogState {
  return {
    error: null,
    profile: null,
    targetGroupId: null,
  };
}

export function buildDeleteGroupDialogState(
  group: SavedConnectionGroup
): DeleteGroupDialogState {
  return {
    error: null,
    pendingDeleteGroup: group,
  };
}

export function clearDeleteGroupDialogState(): DeleteGroupDialogState {
  return {
    error: null,
    pendingDeleteGroup: null,
  };
}

export function validateGroupDialogName(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return {
      error: '请输入分组名称。',
      normalizedName,
    };
  }

  return {
    error: null,
    normalizedName,
  };
}
