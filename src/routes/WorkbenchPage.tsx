import { Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PendingInteractionPanel } from '@/features/workbench/PendingGatePanel';
import { buildSettingsPath } from '@/features/workbench/settingsNavigation';
import {
  buildGroupTree,
  defaultGroupName,
} from '@/features/workbench/workbenchPageModel';
import { useDeferredMount } from '@/features/workbench/useDeferredMount';
import { scheduleIdleTask } from '@/features/workbench/idleTaskScheduler';
import { useKeyboardShortcuts } from '@/features/workbench/useKeyboardShortcuts';
import {
  preloadAiAssistantPanel,
  preloadConnectionPanel,
  preloadHelpDialog,
} from '@/features/workbench/workbenchPanelPreloaders';
import { useWorkbenchGroupActions } from '@/features/workbench/useWorkbenchGroupActions';
import {
  LazyAiAssistantPanel,
  LazyCommandHistoryPanel,
  LazyConfirmDialog,
  LazyConnectionPanel,
  LazyCsvImportModal,
  LazyGroupNameDialog,
  LazyHelpDialog,
  LazyMoveProfileDialog,
  LazyQuickConnectModal,
  LazyTerminalSettingsPanel,
} from '@/features/workbench/workbenchLazyPanels';
import { createAgentSessionModel } from '@/features/workbench/agentSessionModel';
import { useWorkbenchProfileActions } from '@/features/workbench/useWorkbenchProfileActions';
import { useAgentRun } from '@/features/workbench/useAgentRun';
import { useWorkbenchShellState } from '@/features/workbench/useWorkbenchShellState';
import { useWorkbenchSessions } from '@/features/workbench/useWorkbenchSessions';
import { useWorkbenchWorkspaceData } from '@/features/workbench/useWorkbenchWorkspaceData';
import { TerminalWorkspace, type TerminalWorkspaceHandle } from '@/features/workbench/TerminalWorkspace';

import { SessionTree } from '@/features/workbench/SessionTree';
import { UtilityDrawer } from '@/features/workbench/UtilityDrawer';
import { getWorkbenchContentGridClassName } from '@/features/workbench/utilityDrawerModel';
import type {
  SavedConnectionProfile,
} from '@/features/workbench/types';

export function WorkbenchPage() {
  const navigate = useNavigate();
  const [aiAssistantRequestedMode, setAiAssistantRequestedMode] = useState<'agent' | 'chat' | null>(null);
  const [aiAssistantRequestedRunId, setAiAssistantRequestedRunId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPendingGatePanelOpen, setIsPendingGatePanelOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const terminalWorkspaceRef = useRef<TerminalWorkspaceHandle | null>(null);
  const {
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
    toggleAiAssistant,
    toggleHistoryPanel,
    toggleQuickConnect,
    toggleUtilityDrawer,
  } = useWorkbenchShellState();
  const shouldRenderQuickConnect = useDeferredMount(isQuickConnectOpen);
  const shouldRenderHistoryPanel = useDeferredMount(isHistoryPanelOpen);
  const shouldRenderAiAssistant = useDeferredMount(isAiAssistantOpen);
  const shouldRenderHelpDialog = useDeferredMount(isHelpDialogOpen);
  const shouldRenderCsvImport = useDeferredMount(isCsvImportOpen);
  const shouldRenderSettingsPanel = useDeferredMount(isSettingsPanelOpen);
  const shouldRenderPendingGatePanel = useDeferredMount(isPendingGatePanelOpen);
  const {
    isLoadingNodes,
    nodeOnlineStatus,
    nodesError,
    refreshWorkspaceData,
    refreshWorkspaceDataInBackground,
    savedGroupRecords,
    savedProfiles,
    setNodesError,
    setSavedProfiles,
  } = useWorkbenchWorkspaceData();
  const selectedProfile =
    savedProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const defaultGroupId =
    savedGroupRecords.find((group) => group.name === defaultGroupName)?.id ?? null;
  const groupedProfiles = buildGroupTree(savedGroupRecords, savedProfiles);
  const {
    activeSessionId,
    handleActivateProfile: activateProfileSessionState,
    handleCloseSession,
    handleSessionStatusChange,
    handleSwitchToNextTab,
    handleSwitchToPrevTab,
    handleSwitchToTabIndex,
    sessions,
    setActiveSessionId,
    setSessions,
  } = useWorkbenchSessions({
    setIsSidebarCollapsed,
    setSelectedProfileId,
  });
  const agentRun = useAgentRun();
  const agentSessionLock = createAgentSessionModel({
    activeInteraction: agentRun.activeInteraction,
    pendingContinuationRunId: agentRun.pendingContinuationRunId,
  }).sessionLock;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const {
    closeConnectionPanel,
    closeDeleteProfileDialog,
    deleteDialogError: profileDeleteDialogError,
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
  } = useWorkbenchProfileActions({
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
  });
  const {
    closeDeleteGroupDialog,
    closeGroupDialog,
    closeMoveProfileDialog,
    deleteDialogError: groupDeleteDialogError,
    groupDialogError,
    groupDialogMode,
    groupDialogName,
    handleConfirmDeleteGroup,
    handleDeleteGroup,
    handleConfirmGroupDialog,
    handleConfirmMoveProfileToGroup,
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
  } = useWorkbenchGroupActions({
    defaultGroupId,
    refreshWorkspaceData,
    refreshWorkspaceDataInBackground,
    setSavedProfiles,
    setSelectedProfileId,
  });
  const shouldRenderDeleteDialogs = useDeferredMount(
    pendingDeleteProfile !== null || pendingDeleteGroup !== null
  );
  const shouldRenderConnectionPanel = useDeferredMount(isConnectionPanelOpen);
  const shouldRenderGroupDialog = useDeferredMount(groupDialogMode !== null);
  const shouldRenderMoveDialog = useDeferredMount(moveDialogProfile !== null);

  const handleSelectProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
  };

  const handleActivateProfile = (profile: SavedConnectionProfile) => {
    activateProfileSessionState(profile);
    closeConnectionPanel();
  };

  const handleOpenAiAssistant = (requestedMode: 'agent' | 'chat' | null = null) => {
    if (requestedMode) {
      setAiAssistantRequestedMode(requestedMode);
    }

    if (!isAiAssistantOpen) {
      toggleAiAssistant();
    }
  };

  useKeyboardShortcuts({
    onToggleQuickConnect: toggleQuickConnect,
    onToggleCommandHistory: toggleHistoryPanel,
    onToggleLlmSettings: () => {
      void navigate(buildSettingsPath('llm'));
    },
    onToggleAiAssistant: toggleAiAssistant,
    onToggleUtilityDrawer: toggleUtilityDrawer,
    onCloseActiveTab: () => {
      if (activeSessionId) handleCloseSession(activeSessionId);
    },
    onOpenNewConnection: openNewConnection,
    onSwitchToTabIndex: handleSwitchToTabIndex,
    onSwitchToPrevTab: handleSwitchToPrevTab,
    onSwitchToNextTab: handleSwitchToNextTab,
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    return scheduleIdleTask(
      {
        requestIdleCallback: window.requestIdleCallback?.bind(window),
        cancelIdleCallback: window.cancelIdleCallback?.bind(window),
        setTimeout: (callback, delay) => window.setTimeout(callback, delay),
        clearTimeout: (handle) => window.clearTimeout(handle as number | undefined),
      },
      () => {
        preloadConnectionPanel();
        preloadHelpDialog();
        preloadAiAssistantPanel();
      }
    );
  }, []);

  return (
    <div className="flex min-h-screen bg-[var(--app-bg-base)]">
      <SessionTree
        activeSessionId={activeSessionId}
        collapsed={isSidebarCollapsed}
        errorMessage={nodesError}
        groups={groupedProfiles}
        isLoading={isLoadingNodes}
        nodeOnlineStatus={nodeOnlineStatus}
        onActivateProfile={handleActivateProfile}
        onCreateGroup={openCreateGroupDialog}
        onDeleteGroup={handleDeleteGroup}
        onDeleteProfile={handleDeleteProfile}
        onEditProfile={handleEditProfile}
        onMoveProfileToGroup={handleMoveProfileToGroup}
        onOpenNewConnection={openNewConnection}
        onOpenCsvImport={openCsvImport}
        onRenameGroup={handleRequestRenameGroup}
        onSelectProfile={handleSelectProfile}
        onSelectSession={setActiveSessionId}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        onOpenSettings={openSettingsPanel}
        selectedProfileId={selectedProfileId}
        sessions={sessions}
      />

      <div className={getWorkbenchContentGridClassName(isUtilityDrawerOpen)}>
        <TerminalWorkspace
          ref={terminalWorkspaceRef}
          activeSessionId={activeSessionId}
          agentSessionLock={agentSessionLock}
          isUtilityDrawerOpen={isUtilityDrawerOpen}
          isMacShortcutPlatform={typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform)}
          pendingInteractionCount={agentRun.pendingInteractions.length}
          onCloseSession={handleCloseSession}
          onOpenPendingGates={() => setIsPendingGatePanelOpen(true)}
          onOpenNewConnection={openNewConnection}
          onToggleUtilityDrawer={toggleUtilityDrawer}
          onSelectSession={setActiveSessionId}
          onSessionStatusChange={handleSessionStatusChange}
          onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
          onOpenAiAssistant={handleOpenAiAssistant}
          onOpenHelpDialog={openHelpDialog}
          sidebarCollapsed={isSidebarCollapsed}
          sessions={sessions}
        />

        <UtilityDrawer
          activeNodeId={activeSession?.nodeId ?? null}
          activeSessionId={activeSessionId}
          activeSessionLabel={activeSession?.label ?? null}
          onClose={closeUtilityDrawer}
          open={isUtilityDrawerOpen}
          onExecuteCommand={(command) => {
            terminalWorkspaceRef.current?.sendCommandToActive(command);
          }}
        />
      </div>

      {shouldRenderPendingGatePanel ? (
        <PendingInteractionPanel
          items={agentRun.pendingInteractions}
          open={isPendingGatePanelOpen}
          onClose={() => setIsPendingGatePanelOpen(false)}
          onSelectRun={(runId) => {
            setIsPendingGatePanelOpen(false);
            setAiAssistantRequestedRunId(runId);
            handleOpenAiAssistant('agent');
          }}
          onSubmitInteraction={agentRun.submitInteraction}
        />
      ) : null}

      {shouldRenderConnectionPanel ? (
        <Suspense fallback={null}>
          <LazyConnectionPanel
            canDelete={selectedProfileId !== null}
            currentNodeId={selectedProfileId}
            errorMessage={modalError}
            formValues={formValues}
            isSubmitting={isSubmittingConnection}
            onChange={handleFormChange}
            onClose={closeConnectionPanel}
            onConnect={handleConnect}
            onDelete={handleRequestDeleteSelectedProfile}
            onSaveOnly={handleSaveOnly}
            open={isConnectionPanelOpen}
            savedProfiles={savedProfiles}
            title={selectedProfileId ? '连接配置' : '新建连接'}
          />
        </Suspense>
      ) : null}

      {shouldRenderDeleteDialogs ? (
        <Suspense fallback={null}>
          <LazyConfirmDialog
            confirmLabel={isSubmittingConnection ? '删除中...' : '删除节点'}
            description={
              pendingDeleteProfile
                ? `删除节点「${pendingDeleteProfile.name}」后将无法恢复，相关会话也会被关闭。`
                : ''
            }
            destructive
            errorMessage={profileDeleteDialogError}
            onClose={closeDeleteProfileDialog}
            onConfirm={() => {
              if (!pendingDeleteProfile) {
                return;
              }

              void handleDeleteNode(pendingDeleteProfile);
            }}
            open={pendingDeleteProfile !== null}
            title="确认删除"
          />

          <LazyConfirmDialog
            confirmLabel={isSubmittingDeleteGroup ? '删除中...' : '删除分组'}
            description={
              pendingDeleteGroup
                ? `删除分组「${pendingDeleteGroup.name}」后，其中的主机会自动移动到默认分组。`
                : ''
            }
            destructive
            errorMessage={groupDeleteDialogError}
            onClose={closeDeleteGroupDialog}
            onConfirm={() => {
              void handleConfirmDeleteGroup();
            }}
            open={pendingDeleteGroup !== null}
            title="确认删除分组"
          />
        </Suspense>
      ) : null}

      {shouldRenderGroupDialog ? (
        <Suspense fallback={null}>
          <LazyGroupNameDialog
            confirmLabel={groupDialogMode === 'rename' ? '保存分组' : '新建分组'}
            description={
              groupDialogMode === 'rename'
                ? '修改分组名称后，左侧分组树会立即更新。'
                : '创建分组后，可以把主机移动到该分组下。'
            }
            errorMessage={groupDialogError}
            isSubmitting={isSubmittingGroupAction}
            onClose={closeGroupDialog}
            onConfirm={() => {
              void handleConfirmGroupDialog();
            }}
            onValueChange={handleGroupDialogNameChange}
            open={groupDialogMode !== null}
            title={groupDialogMode === 'rename' ? '重命名分组' : '新建分组'}
            value={groupDialogName}
          />
        </Suspense>
      ) : null}

      {shouldRenderMoveDialog ? (
        <Suspense fallback={null}>
          <LazyMoveProfileDialog
            errorMessage={moveDialogError}
            groups={groupedProfiles}
            isSubmitting={isSubmittingGroupAction}
            onClose={closeMoveProfileDialog}
            onConfirm={() => {
              void handleConfirmMoveProfileToGroup();
            }}
            onSelectGroup={handleMoveDialogGroupSelect}
            open={moveDialogProfile !== null}
            profile={moveDialogProfile}
            selectedGroupId={moveDialogTargetGroupId}
          />
        </Suspense>
      ) : null}

      {shouldRenderQuickConnect ? (
        <Suspense fallback={null}>
          <LazyQuickConnectModal
            onClose={closeQuickConnect}
            onConnect={(profile) => {
              closeQuickConnect();
              handleActivateProfile(profile);
            }}
            open={isQuickConnectOpen}
            profiles={savedProfiles}
          />
        </Suspense>
      ) : null}

      {shouldRenderHistoryPanel ? (
        <Suspense fallback={null}>
          <LazyCommandHistoryPanel
            open={isHistoryPanelOpen}
            activeNodeId={sessions.find((s) => s.id === activeSessionId)?.nodeId}
            onClose={closeHistoryPanel}
            onExecute={(command) => {
              terminalWorkspaceRef.current?.sendCommandToActive(command);
              closeHistoryPanel();
            }}
          />
        </Suspense>
      ) : null}

      {shouldRenderAiAssistant ? (
        <Suspense fallback={null}>
          <LazyAiAssistantPanel
            open={isAiAssistantOpen}
            onClose={closeAiAssistant}
            sessions={sessions}
            activeSessionId={activeSessionId}
            agentRun={agentRun}
            requestedMode={aiAssistantRequestedMode}
            onRequestedModeApplied={() => setAiAssistantRequestedMode(null)}
            requestedRunId={aiAssistantRequestedRunId}
            onRequestedRunApplied={() => setAiAssistantRequestedRunId(null)}
          />
        </Suspense>
      ) : null}

      {shouldRenderHelpDialog ? (
        <Suspense fallback={null}>
          <LazyHelpDialog
            isMacShortcutPlatform={
              typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform)
            }
            onClose={closeHelpDialog}
            open={isHelpDialogOpen}
          />
        </Suspense>
      ) : null}

      {shouldRenderCsvImport ? (
        <Suspense fallback={null}>
          <LazyCsvImportModal
            open={isCsvImportOpen}
            onClose={closeCsvImport}
            onSuccess={refreshWorkspaceDataInBackground}
          />
        </Suspense>
      ) : null}

      {shouldRenderSettingsPanel ? (
        <Suspense fallback={null}>
          <LazyTerminalSettingsPanel
            open={isSettingsPanelOpen}
            onClose={closeSettingsPanel}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
