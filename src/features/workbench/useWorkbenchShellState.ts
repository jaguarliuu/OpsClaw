import { useState } from 'react';

import {
  closeOverlayState,
  openOverlayState,
  toggleBooleanState,
} from './workbenchShellModel';
import {
  getDefaultUtilityDrawerOpenState as getDefaultUtilityDrawerState,
  nextUtilityDrawerOpenState,
} from './utilityDrawerModel';

export function useWorkbenchShellState() {
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(
    getDefaultUtilityDrawerState()
  );

  const toggleQuickConnect = () => {
    setIsQuickConnectOpen((current) => toggleBooleanState(current));
  };

  const toggleHistoryPanel = () => {
    setIsHistoryPanelOpen((current) => toggleBooleanState(current));
  };

  const toggleAiAssistant = () => {
    setIsAiAssistantOpen((current) => toggleBooleanState(current));
  };

  const openHelpDialog = () => {
    setIsHelpDialogOpen(openOverlayState());
  };

  const closeHelpDialog = () => {
    setIsHelpDialogOpen(closeOverlayState());
  };

  const openCsvImport = () => {
    setIsCsvImportOpen(openOverlayState());
  };

  const closeCsvImport = () => {
    setIsCsvImportOpen(closeOverlayState());
  };

  const openSettingsPanel = () => {
    setIsSettingsPanelOpen(openOverlayState());
  };

  const closeSettingsPanel = () => {
    setIsSettingsPanelOpen(closeOverlayState());
  };

  const closeQuickConnect = () => {
    setIsQuickConnectOpen(closeOverlayState());
  };

  const closeHistoryPanel = () => {
    setIsHistoryPanelOpen(closeOverlayState());
  };

  const closeAiAssistant = () => {
    setIsAiAssistantOpen(closeOverlayState());
  };

  const toggleUtilityDrawer = () => {
    setIsUtilityDrawerOpen((current) => nextUtilityDrawerOpenState(current, 'toggle'));
  };

  const openUtilityDrawer = () => {
    setIsUtilityDrawerOpen((current) => nextUtilityDrawerOpenState(current, 'open'));
  };

  const closeUtilityDrawer = () => {
    setIsUtilityDrawerOpen((current) => nextUtilityDrawerOpenState(current, 'close'));
  };

  return {
    closeAiAssistant,
    closeCsvImport,
    closeHelpDialog,
    closeHistoryPanel,
    closeQuickConnect,
    closeSettingsPanel,
    closeUtilityDrawer,
    isAiAssistantOpen,
    isCsvImportOpen,
    isHelpDialogOpen,
    isHistoryPanelOpen,
    isQuickConnectOpen,
    isSettingsPanelOpen,
    isUtilityDrawerOpen,
    openCsvImport,
    openHelpDialog,
    openSettingsPanel,
    openUtilityDrawer,
    toggleAiAssistant,
    toggleHistoryPanel,
    toggleQuickConnect,
    toggleUtilityDrawer,
  };
}
