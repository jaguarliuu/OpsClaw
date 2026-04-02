import { useState } from 'react';

import {
  closeOverlayState,
  openOverlayState,
  toggleBooleanState,
} from './workbenchShellModel';
import { nextUtilityDrawerOpenState } from './utilityDrawerModel';

export function useWorkbenchShellState() {
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(true);

  const toggleQuickConnect = () => {
    setIsQuickConnectOpen((current) => toggleBooleanState(current));
  };

  const toggleHistoryPanel = () => {
    setIsHistoryPanelOpen((current) => toggleBooleanState(current));
  };

  const toggleAiAssistant = () => {
    setIsAiAssistantOpen((current) => toggleBooleanState(current));
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
    closeHistoryPanel,
    closeQuickConnect,
    closeSettingsPanel,
    closeUtilityDrawer,
    isAiAssistantOpen,
    isCsvImportOpen,
    isHistoryPanelOpen,
    isQuickConnectOpen,
    isSettingsPanelOpen,
    isUtilityDrawerOpen,
    openCsvImport,
    openSettingsPanel,
    openUtilityDrawer,
    toggleAiAssistant,
    toggleHistoryPanel,
    toggleQuickConnect,
    toggleUtilityDrawer,
  };
}
