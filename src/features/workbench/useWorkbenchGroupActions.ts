import { useState, type Dispatch, type SetStateAction } from 'react';

import {
  createGroup,
  deleteGroup,
  moveNodeToGroup,
  renameGroup,
} from './api';
import type { SavedConnectionGroup, SavedConnectionProfile } from './types';
import { mapNodeToProfile, upsertProfile } from './workbenchPageModel';
import {
  buildCreateGroupDialogState,
  buildDeleteGroupDialogState,
  buildMoveProfileDialogState,
  buildRenameGroupDialogState,
  clearDeleteGroupDialogState,
  clearGroupDialogState,
  clearMoveProfileDialogState,
  validateGroupDialogName,
} from './workbenchGroupActionsModel';

type UseWorkbenchGroupActionsOptions = {
  defaultGroupId: string | null;
  refreshWorkspaceData: () => Promise<unknown>;
  refreshWorkspaceDataInBackground: () => void;
  setSavedProfiles: Dispatch<SetStateAction<SavedConnectionProfile[]>>;
  setSelectedProfileId: Dispatch<SetStateAction<string | null>>;
};

export function useWorkbenchGroupActions({
  defaultGroupId,
  refreshWorkspaceData,
  refreshWorkspaceDataInBackground,
  setSavedProfiles,
  setSelectedProfileId,
}: UseWorkbenchGroupActionsOptions) {
  const [isSubmittingGroupAction, setIsSubmittingGroupAction] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<'create' | 'rename' | null>(null);
  const [groupDialogTarget, setGroupDialogTarget] = useState<SavedConnectionGroup | null>(null);
  const [groupDialogName, setGroupDialogName] = useState('');
  const [groupDialogError, setGroupDialogError] = useState<string | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<SavedConnectionGroup | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [isSubmittingDeleteGroup, setIsSubmittingDeleteGroup] = useState(false);
  const [moveDialogProfile, setMoveDialogProfile] = useState<SavedConnectionProfile | null>(null);
  const [moveDialogTargetGroupId, setMoveDialogTargetGroupId] = useState<string | null>(null);
  const [moveDialogError, setMoveDialogError] = useState<string | null>(null);

  const openCreateGroupDialog = () => {
    const nextState = buildCreateGroupDialogState();
    setGroupDialogMode(nextState.mode);
    setGroupDialogTarget(nextState.target);
    setGroupDialogName(nextState.name);
    setGroupDialogError(nextState.error);
  };

  const closeGroupDialog = () => {
    const nextState = clearGroupDialogState();
    setGroupDialogMode(nextState.mode);
    setGroupDialogTarget(nextState.target);
    setGroupDialogName(nextState.name);
    setGroupDialogError(nextState.error);
  };

  const handleRequestRenameGroup = (group: SavedConnectionGroup) => {
    if (group.isDefault) {
      return;
    }

    const nextState = buildRenameGroupDialogState(group);
    setGroupDialogMode(nextState.mode);
    setGroupDialogTarget(nextState.target);
    setGroupDialogName(nextState.name);
    setGroupDialogError(nextState.error);
  };

  const handleGroupDialogNameChange = (value: string) => {
    setGroupDialogName(value);
    setGroupDialogError(null);
  };

  const handleConfirmGroupDialog = async () => {
    const validation = validateGroupDialogName(groupDialogName);
    if (validation.error) {
      setGroupDialogError(validation.error);
      return;
    }

    setIsSubmittingGroupAction(true);
    setGroupDialogError(null);

    try {
      if (groupDialogMode === 'create') {
        await createGroup(validation.normalizedName);
      }

      if (groupDialogMode === 'rename' && groupDialogTarget) {
        await renameGroup(groupDialogTarget.id, validation.normalizedName);
      }

      await refreshWorkspaceData();
      closeGroupDialog();
    } catch (error) {
      setGroupDialogError(error instanceof Error ? error.message : '分组保存失败。');
    } finally {
      setIsSubmittingGroupAction(false);
    }
  };

  const handleMoveProfileToGroup = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    const nextState = buildMoveProfileDialogState(profile, defaultGroupId);
    setMoveDialogProfile(nextState.profile);
    setMoveDialogTargetGroupId(nextState.targetGroupId);
    setMoveDialogError(nextState.error);
  };

  const closeMoveProfileDialog = () => {
    const nextState = clearMoveProfileDialogState();
    setMoveDialogProfile(nextState.profile);
    setMoveDialogTargetGroupId(nextState.targetGroupId);
    setMoveDialogError(nextState.error);
  };

  const handleMoveDialogGroupSelect = (groupId: string) => {
    setMoveDialogTargetGroupId(groupId);
    setMoveDialogError(null);
  };

  const handleConfirmMoveProfileToGroup = async () => {
    if (!moveDialogProfile || !moveDialogTargetGroupId) {
      return;
    }

    setIsSubmittingGroupAction(true);
    setMoveDialogError(null);

    try {
      const updatedNode = await moveNodeToGroup(moveDialogProfile.id, moveDialogTargetGroupId);
      setSavedProfiles((current) => upsertProfile(current, mapNodeToProfile(updatedNode)));
      closeMoveProfileDialog();
      refreshWorkspaceDataInBackground();
    } catch (error) {
      setMoveDialogError(error instanceof Error ? error.message : '节点移动失败。');
    } finally {
      setIsSubmittingGroupAction(false);
    }
  };

  const handleDeleteGroup = (group: SavedConnectionGroup) => {
    if (group.isDefault) {
      return;
    }

    const nextState = buildDeleteGroupDialogState(group);
    setDeleteDialogError(nextState.error);
    setPendingDeleteGroup(nextState.pendingDeleteGroup);
  };

  const closeDeleteGroupDialog = () => {
    const nextState = clearDeleteGroupDialogState();
    setDeleteDialogError(nextState.error);
    setPendingDeleteGroup(nextState.pendingDeleteGroup);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) {
      return;
    }

    setIsSubmittingDeleteGroup(true);
    setDeleteDialogError(null);

    try {
      await deleteGroup(pendingDeleteGroup.id);
      await refreshWorkspaceData();
      setPendingDeleteGroup(null);
    } catch (error) {
      setDeleteDialogError(error instanceof Error ? error.message : '分组删除失败。');
    } finally {
      setIsSubmittingDeleteGroup(false);
    }
  };

  return {
    closeDeleteGroupDialog,
    closeGroupDialog,
    closeMoveProfileDialog,
    deleteDialogError,
    groupDialogError,
    groupDialogMode,
    groupDialogName,
    groupDialogTarget,
    handleConfirmGroupDialog,
    handleConfirmMoveProfileToGroup,
    handleConfirmDeleteGroup,
    handleDeleteGroup,
    handleGroupDialogNameChange,
    handleMoveDialogGroupSelect,
    handleMoveProfileToGroup,
    handleRequestRenameGroup,
    isSubmittingDeleteGroup,
    isSubmittingGroupAction,
    moveDialogError,
    moveDialogProfile,
    moveDialogTargetGroupId,
    openCreateGroupDialog,
    pendingDeleteGroup,
  };
}
