import { useState, type Dispatch, type SetStateAction } from 'react';

import {
  createNode,
  deleteNode,
  fetchNode,
  updateNode,
} from './api';
import type {
  ConnectionFormValues,
  LiveSession,
  SavedConnectionProfile,
} from './types';
import {
  buildNodeInput,
  buildSessionFromProfile,
  defaultFormValues,
  mapNodeDetailToFormValues,
  mapNodeToProfile,
  upsertProfile,
  validateForm,
} from './workbenchPageModel';
import { removeNodeSessions } from './workbenchSessionModel';
import {
  buildDeleteProfileDialogState,
  buildEditProfileState,
  buildOpenNewConnectionState,
  clearDeleteProfileDialogState,
  getProfileActionErrorMessage,
} from './workbenchProfileActionsModel';

type UseWorkbenchProfileActionsOptions = {
  activeSessionId: string | null;
  defaultGroupId: string | null;
  refreshWorkspaceDataInBackground: () => void;
  selectedProfile: SavedConnectionProfile | null;
  selectedProfileId: string | null;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setIsSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setNodesError: Dispatch<SetStateAction<string | null>>;
  setSavedProfiles: Dispatch<SetStateAction<SavedConnectionProfile[]>>;
  setSelectedProfileId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<LiveSession[]>>;
};

export function useWorkbenchProfileActions({
  activeSessionId,
  defaultGroupId,
  refreshWorkspaceDataInBackground,
  selectedProfile,
  selectedProfileId,
  setActiveSessionId,
  setIsSidebarCollapsed,
  setNodesError,
  setSavedProfiles,
  setSelectedProfileId,
  setSessions,
}: UseWorkbenchProfileActionsOptions) {
  const [formValues, setFormValues] = useState<ConnectionFormValues>(defaultFormValues);
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);
  const [isSubmittingConnection, setIsSubmittingConnection] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<SavedConnectionProfile | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

  const handleFormChange = <K extends keyof ConnectionFormValues>(
    key: K,
    value: ConnectionFormValues[K]
  ) => {
    setModalError(null);
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const openNewConnection = () => {
    const nextState = buildOpenNewConnectionState();
    setSelectedProfileId(nextState.selectedProfileId);
    setModalError(nextState.modalError);
    setFormValues(nextState.formValues);
    setIsConnectionPanelOpen(nextState.isConnectionPanelOpen);
  };

  const closeConnectionPanel = () => {
    setIsConnectionPanelOpen(false);
  };

  const handleEditProfile = (profile: SavedConnectionProfile) => {
    const nextState = buildEditProfileState(profile.id);
    setSelectedProfileId(nextState.selectedProfileId);
    setModalError(nextState.modalError);
    setIsConnectionPanelOpen(nextState.isConnectionPanelOpen);
    setIsSubmittingConnection(nextState.isSubmittingConnection);

    void fetchNode(profile.id)
      .then((node) => {
        setSavedProfiles((current) => upsertProfile(current, mapNodeToProfile(node)));
        setSelectedProfileId(node.id);
        setFormValues(mapNodeDetailToFormValues(node));
      })
      .catch((error) => {
        setModalError(getProfileActionErrorMessage(error, '节点读取失败。'));
      })
      .finally(() => {
        setIsSubmittingConnection(false);
      });
  };

  const persistProfile = async () => {
    const validationError = validateForm(formValues);
    if (validationError) {
      setModalError(validationError);
      return null;
    }

    setIsSubmittingConnection(true);

    try {
      const payload = buildNodeInput(
        formValues,
        selectedProfile?.groupId ?? defaultGroupId
      );
      const node = selectedProfileId
        ? await updateNode(selectedProfileId, payload)
        : await createNode(payload);
      const savedProfile = mapNodeToProfile(node);

      setSavedProfiles((current) => upsertProfile(current, savedProfile));
      setSelectedProfileId(savedProfile.id);
      setNodesError(null);
      setModalError(null);
      refreshWorkspaceDataInBackground();

      return savedProfile;
    } catch (error) {
      setModalError(getProfileActionErrorMessage(error, '节点保存失败。'));
      return null;
    } finally {
      setIsSubmittingConnection(false);
    }
  };

  const handleSaveOnly = async () => {
    const savedProfile = await persistProfile();
    if (!savedProfile) {
      return;
    }

    setIsConnectionPanelOpen(false);
  };

  const handleConnect = async (saveProfileBeforeConnect: boolean) => {
    if (!saveProfileBeforeConnect) {
      return;
    }

    const savedProfile = await persistProfile();
    if (!savedProfile) {
      return;
    }

    const nextSession = buildSessionFromProfile(savedProfile);
    setSessions((current) => [...current, nextSession]);
    setActiveSessionId(nextSession.id);
    setIsConnectionPanelOpen(false);
    setIsSidebarCollapsed(true);
    setModalError(null);
  };

  const handleDeleteNode = async (profileOverride?: SavedConnectionProfile) => {
    const targetId = profileOverride?.id ?? selectedProfileId;
    if (!targetId) {
      return;
    }

    setIsSubmittingConnection(true);
    setDeleteDialogError(null);

    try {
      await deleteNode(targetId);

      setSavedProfiles((current) =>
        current.filter((profile) => profile.id !== targetId)
      );
      setSessions((current) => {
        const nextState = removeNodeSessions(current, targetId, activeSessionId);
        if (nextState.activeSessionId !== activeSessionId) {
          setActiveSessionId(nextState.activeSessionId);
        }
        return nextState.sessions;
      });
      if (selectedProfileId === targetId) {
        setSelectedProfileId(null);
      }
      setPendingDeleteProfile(null);
      setFormValues(defaultFormValues);
      setIsConnectionPanelOpen(false);
      setModalError(null);
      refreshWorkspaceDataInBackground();
    } catch (error) {
      setDeleteDialogError(getProfileActionErrorMessage(error, '节点删除失败。'));
    } finally {
      setIsSubmittingConnection(false);
    }
  };

  const handleDeleteProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    const nextState = buildDeleteProfileDialogState(profile);
    setDeleteDialogError(nextState.deleteDialogError);
    setPendingDeleteProfile(nextState.pendingDeleteProfile);
  };

  const handleRequestDeleteSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    const nextState = buildDeleteProfileDialogState(selectedProfile);
    setDeleteDialogError(nextState.deleteDialogError);
    setPendingDeleteProfile(nextState.pendingDeleteProfile);
  };

  const closeDeleteProfileDialog = () => {
    const nextState = clearDeleteProfileDialogState();
    setDeleteDialogError(nextState.deleteDialogError);
    setPendingDeleteProfile(nextState.pendingDeleteProfile);
  };

  return {
    closeConnectionPanel,
    closeDeleteProfileDialog,
    deleteDialogError,
    formValues,
    handleConnect,
    handleDeleteNode,
    handleDeleteProfile,
    handleEditProfile,
    handleFormChange,
    handleRequestDeleteSelectedProfile,
    handleSaveOnly,
    isConnectionPanelOpen,
    isSubmittingConnection,
    modalError,
    openNewConnection,
    pendingDeleteProfile,
  };
}
