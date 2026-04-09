import { useState } from 'react';

import {
  closeOverlayState,
  openOverlayState,
  toggleBooleanState,
} from './workbenchShellModel';

export function useWorkbenchShellState() {
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);

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

  const closeQuickConnect = () => {
    setIsQuickConnectOpen(closeOverlayState());
  };

  const closeHistoryPanel = () => {
    setIsHistoryPanelOpen(closeOverlayState());
  };

  const closeAiAssistant = () => {
    setIsAiAssistantOpen(closeOverlayState());
  };

  return {
    closeAiAssistant,
    closeCsvImport,
    closeHelpDialog,
    closeHistoryPanel,
    closeQuickConnect,
    isAiAssistantOpen,
    isCsvImportOpen,
    isHelpDialogOpen,
    isHistoryPanelOpen,
    isQuickConnectOpen,
    openCsvImport,
    openHelpDialog,
    toggleAiAssistant,
    toggleHistoryPanel,
    toggleQuickConnect,
  };
}
