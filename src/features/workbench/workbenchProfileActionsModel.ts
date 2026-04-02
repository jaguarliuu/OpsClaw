import type { SavedConnectionProfile } from './types';
import { defaultFormValues } from './workbenchPageModel';

export function buildOpenNewConnectionState() {
  return {
    formValues: defaultFormValues,
    isConnectionPanelOpen: true,
    isSidebarCollapsed: false,
    modalError: null,
    selectedProfileId: null,
  };
}

export function buildEditProfileState(profileId: string) {
  return {
    isConnectionPanelOpen: true,
    isSubmittingConnection: true,
    modalError: null,
    selectedProfileId: profileId,
  };
}

export function buildDeleteProfileDialogState(profile: SavedConnectionProfile) {
  return {
    deleteDialogError: null,
    pendingDeleteProfile: profile,
  };
}

export function clearDeleteProfileDialogState() {
  return {
    deleteDialogError: null,
    pendingDeleteProfile: null,
  };
}

export function getProfileActionErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}
