import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CommandHistoryPanel } from '@/features/workbench/CommandHistoryPanel';
import { QuickConnectModal } from '@/features/workbench/QuickConnectModal';
import { LlmProviderSettings } from '@/features/workbench/LlmProviderSettings';
import { AiAssistantPanel } from '@/features/workbench/AiAssistantPanel';
import { CsvImportModal } from '@/features/workbench/CsvImportModal';
import { useKeyboardShortcuts } from '@/features/workbench/useKeyboardShortcuts';
import { TerminalWorkspace, type TerminalWorkspaceHandle } from '@/features/workbench/TerminalWorkspace';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ConnectionPanel } from '@/features/workbench/ConnectionPanel';
import { GroupNameDialog, MoveProfileDialog } from '@/features/workbench/GroupDialogs';
import {
  createGroup,
  createNode,
  deleteGroup,
  deleteNode,
  fetchGroups,
  fetchNode,
  fetchNodes,
  fetchPingAll,
  fetchLlmProviders,
  moveNodeToGroup,
  renameGroup,
  updateNode,
  type GroupRecord,
  type NodeDetailRecord,
  type NodeSummaryRecord,
  type NodeUpsertInput,
} from '@/features/workbench/api';
import { SessionTree } from '@/features/workbench/SessionTree';
import type {
  ConnectionFormValues,
  ConnectionStatus,
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';

const defaultGroupName = '默认';

const defaultFormValues: ConnectionFormValues = {
  label: '',
  host: '',
  port: '22',
  username: '',
  authMode: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  jumpHostId: '',
};

function mapNodeToProfile(node: NodeSummaryRecord): SavedConnectionProfile {
  return {
    id: node.id,
    name: node.name,
    groupId: node.groupId,
    group: node.groupName,
    jumpHostId: node.jumpHostId,
    host: node.host,
    port: node.port,
    username: node.username,
    authMode: node.authMode,
    note: node.note,
  };
}

function mapNodeDetailToFormValues(node: NodeDetailRecord): ConnectionFormValues {
  return {
    label: node.name,
    host: node.host,
    port: String(node.port),
    username: node.username,
    authMode: node.authMode,
    password: node.password ?? '',
    privateKey: node.privateKey ?? '',
    passphrase: node.passphrase ?? '',
    jumpHostId: node.jumpHostId ?? '',
  };
}

function buildGroupTree(
  groupRecords: GroupRecord[],
  profiles: SavedConnectionProfile[]
): SavedConnectionGroup[] {
  const groupsById = new Map<string, SavedConnectionGroup>();

  groupRecords.forEach((group) => {
    groupsById.set(group.id, {
      id: group.id,
      name: group.name,
      isDefault: group.name === defaultGroupName,
      profiles: [],
    });
  });

  const fallbackGroups = new Map<string, SavedConnectionGroup>();

  profiles.forEach((profile) => {
    const matchedGroup =
      (profile.groupId ? groupsById.get(profile.groupId) : null) ??
      fallbackGroups.get(profile.group) ??
      null;

    if (matchedGroup) {
      matchedGroup.profiles.push(profile);
      return;
    }

    const fallbackGroup: SavedConnectionGroup = {
      id: profile.groupId ?? `fallback:${profile.group}`,
      name: profile.group,
      isDefault: profile.group === defaultGroupName,
      profiles: [profile],
    };

    fallbackGroups.set(profile.group, fallbackGroup);
  });

  return [
    ...groupRecords
      .map((group) => groupsById.get(group.id))
      .filter((group): group is SavedConnectionGroup => group !== undefined),
    ...Array.from(fallbackGroups.values()).filter(
      (group) => !groupRecords.some((item) => item.name === group.name)
    ),
  ];
}

function upsertProfile(
  profiles: SavedConnectionProfile[],
  nextProfile: SavedConnectionProfile
) {
  const existingIndex = profiles.findIndex((profile) => profile.id === nextProfile.id)
  if (existingIndex === -1) {
    return [...profiles, nextProfile]
  }

  return profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
}

function validateForm(formValues: ConnectionFormValues) {
  if (!formValues.host.trim()) {
    return '请输入服务器地址。';
  }

  if (!formValues.username.trim()) {
    return '请输入用户名。';
  }

  const port = Number(formValues.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return '端口必须是 1 到 65535 之间的整数。';
  }

  if (formValues.authMode === 'password' && !formValues.password.trim()) {
    return '密码验证必须填写密码。';
  }

  if (formValues.authMode === 'privateKey' && !formValues.privateKey.trim()) {
    return '密钥验证必须填写私钥。';
  }

  return null;
}

function buildNodeInput(
  formValues: ConnectionFormValues,
  groupId: string | null
): NodeUpsertInput {
  return {
    name: formValues.label.trim() || formValues.host.trim(),
    groupId: groupId ?? undefined,
    groupName: groupId ? undefined : defaultGroupName,
    jumpHostId: formValues.jumpHostId || undefined,
    host: formValues.host.trim(),
    port: Number(formValues.port),
    username: formValues.username.trim(),
    authMode: formValues.authMode,
    password: formValues.authMode === 'password' ? formValues.password : undefined,
    privateKey: formValues.authMode === 'privateKey' ? formValues.privateKey : undefined,
    passphrase: formValues.authMode === 'privateKey' ? formValues.passphrase : undefined,
    note: formValues.authMode === 'password' ? '密码连接' : '密钥连接',
  };
}

function buildSessionFromProfile(profile: SavedConnectionProfile): LiveSession {
  return {
    id: crypto.randomUUID(),
    label: profile.name,
    nodeId: profile.id,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authMode: profile.authMode,
    status: 'connecting',
  };
}

async function loadWorkspaceData() {
  const [nodes, groups] = await Promise.all([fetchNodes(), fetchGroups()]);

  return {
    groups,
    profiles: nodes.map(mapNodeToProfile),
  };
}

export function WorkbenchPage() {
  const navigate = useNavigate();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ConnectionFormValues>(defaultFormValues);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedConnectionProfile[]>([]);
  const [savedGroupRecords, setSavedGroupRecords] = useState<GroupRecord[]>([]);
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<SavedConnectionProfile | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<SavedConnectionGroup | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [isSubmittingConnection, setIsSubmittingConnection] = useState(false);
  const [isSubmittingGroupAction, setIsSubmittingGroupAction] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<'create' | 'rename' | null>(null);
  const [groupDialogTarget, setGroupDialogTarget] = useState<SavedConnectionGroup | null>(null);
  const [groupDialogName, setGroupDialogName] = useState('');
  const [groupDialogError, setGroupDialogError] = useState<string | null>(null);
  const [moveDialogProfile, setMoveDialogProfile] = useState<SavedConnectionProfile | null>(null);
  const [moveDialogTargetGroupId, setMoveDialogTargetGroupId] = useState<string | null>(null);
  const [moveDialogError, setMoveDialogError] = useState<string | null>(null);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isLlmSettingsOpen, setIsLlmSettingsOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [nodeOnlineStatus, setNodeOnlineStatus] = useState<Record<string, boolean>>({});
  const terminalWorkspaceRef = useRef<TerminalWorkspaceHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoadingNodes(true);

      try {
        const { groups, profiles } = await loadWorkspaceData();
        if (cancelled) {
          return;
        }

        setSavedGroupRecords(groups);
        setSavedProfiles(profiles);
        setNodesError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setNodesError(error instanceof Error ? error.message : '节点加载失败。');
      } finally {
        if (!cancelled) {
          setIsLoadingNodes(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const poll = () => {
      void fetchPingAll()
        .then((results) => {
          setNodeOnlineStatus(
            Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.online]))
          );
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void fetchLlmProviders()
      .then((providers) => {
        const defaultProvider = providers.find((p) => p.isDefault);
        setDefaultProviderId(defaultProvider?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const reloadDefaultProvider = () => {
    void fetchLlmProviders()
      .then((providers) => {
        const defaultProvider = providers.find((p) => p.isDefault);
        setDefaultProviderId(defaultProvider?.id ?? null);
      })
      .catch(() => {});
  };



  const refreshWorkspaceData = async () => {
    const { groups, profiles } = await loadWorkspaceData();
    setSavedGroupRecords(groups);
    setSavedProfiles(profiles);
    setNodesError(null);
    return { groups, profiles };
  };

  const refreshWorkspaceDataInBackground = () => {
    void refreshWorkspaceData().catch((error) => {
      setNodesError(error instanceof Error ? error.message : '节点加载失败。');
    });
  };

  const findOpenSession = (profile: SavedConnectionProfile) =>
    sessions.find(
      (session) =>
        session.host === profile.host &&
        session.port === profile.port &&
        session.username === profile.username &&
        session.status !== 'closed'
    );

  const selectedProfile =
    savedProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const defaultGroupId =
    savedGroupRecords.find((group) => group.name === defaultGroupName)?.id ?? null;
  const groupedProfiles = buildGroupTree(savedGroupRecords, savedProfiles);

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
    setSelectedProfileId(null);
    setModalError(null);
    setFormValues(defaultFormValues);
    setIsConnectionPanelOpen(true);
    setIsSidebarCollapsed(false);
  };

  const openCreateGroupDialog = () => {
    setGroupDialogMode('create');
    setGroupDialogTarget(null);
    setGroupDialogName('');
    setGroupDialogError(null);
  };

  const handleSelectProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
  };

  const handleEditProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    setModalError(null);
    setIsConnectionPanelOpen(true);
    setIsSubmittingConnection(true);

    void fetchNode(profile.id)
      .then((node) => {
        setSavedProfiles((current) => upsertProfile(current, mapNodeToProfile(node)));
        setSelectedProfileId(node.id);
        setFormValues(mapNodeDetailToFormValues(node));
      })
      .catch((error) => {
        setModalError(error instanceof Error ? error.message : '节点读取失败。');
      })
      .finally(() => {
        setIsSubmittingConnection(false);
      });
  };

  const handleActivateProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);

    const existingSession = findOpenSession(profile);
    if (existingSession) {
      setActiveSessionId(existingSession.id);
      setIsSidebarCollapsed(true);
      return;
    }

    const nextSession = buildSessionFromProfile(profile);
    setSessions((current) => [...current, nextSession]);
    setActiveSessionId(nextSession.id);
    setIsConnectionPanelOpen(false);
    setIsSidebarCollapsed(true);
    setModalError(null);
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
      const message = error instanceof Error ? error.message : '节点保存失败。';
      setModalError(message);
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
        const remaining = current.filter((session) => session.nodeId !== targetId);
        if (
          activeSessionId &&
          current.some((session) => session.id === activeSessionId && session.nodeId === targetId)
        ) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
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
      setDeleteDialogError(error instanceof Error ? error.message : '节点删除失败。');
    } finally {
      setIsSubmittingConnection(false);
    }
  };

  const handleDeleteProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    setDeleteDialogError(null);
    setPendingDeleteProfile(profile);
  };

  const handleRequestDeleteSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    setDeleteDialogError(null);
    setPendingDeleteProfile(selectedProfile);
  };

  const handleMoveProfileToGroup = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    setMoveDialogProfile(profile);
    setMoveDialogTargetGroupId(profile.groupId ?? defaultGroupId);
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
      setMoveDialogProfile(null);
      setMoveDialogTargetGroupId(null);
      refreshWorkspaceDataInBackground();
    } catch (error) {
      setMoveDialogError(error instanceof Error ? error.message : '节点移动失败。');
    } finally {
      setIsSubmittingGroupAction(false);
    }
  };

  const handleRequestRenameGroup = (group: SavedConnectionGroup) => {
    if (group.isDefault) {
      return;
    }

    setGroupDialogMode('rename');
    setGroupDialogTarget(group);
    setGroupDialogName(group.name);
    setGroupDialogError(null);
  };

  const handleConfirmGroupDialog = async () => {
    const normalizedName = groupDialogName.trim();
    if (!normalizedName) {
      setGroupDialogError('请输入分组名称。');
      return;
    }

    setIsSubmittingGroupAction(true);
    setGroupDialogError(null);

    try {
      if (groupDialogMode === 'create') {
        await createGroup(normalizedName);
      }

      if (groupDialogMode === 'rename' && groupDialogTarget) {
        await renameGroup(groupDialogTarget.id, normalizedName);
      }

      await refreshWorkspaceData();
      setGroupDialogMode(null);
      setGroupDialogTarget(null);
      setGroupDialogName('');
    } catch (error) {
      setGroupDialogError(error instanceof Error ? error.message : '分组保存失败。');
    } finally {
      setIsSubmittingGroupAction(false);
    }
  };

  const handleDeleteGroup = (group: SavedConnectionGroup) => {
    if (group.isDefault) {
      return;
    }

    setDeleteDialogError(null);
    setPendingDeleteGroup(group);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) {
      return;
    }

    setIsSubmittingGroupAction(true);
    setDeleteDialogError(null);

    try {
      await deleteGroup(pendingDeleteGroup.id);
      await refreshWorkspaceData();
      setPendingDeleteGroup(null);
    } catch (error) {
      setDeleteDialogError(error instanceof Error ? error.message : '分组删除失败。');
    } finally {
      setIsSubmittingGroupAction(false);
    }
  };

  const handleSessionStatusChange = (
    sessionId: string,
    status: ConnectionStatus,
    errorMessage?: string
  ) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        if (session.status === status && session.errorMessage === errorMessage) {
          return session;
        }

        return {
          ...session,
          status,
          errorMessage,
        };
      })
    );
  };

  const handleCloseSession = (sessionId: string) => {
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  useKeyboardShortcuts({
    onToggleQuickConnect: () => setIsQuickConnectOpen((prev) => !prev),
    onToggleCommandHistory: () => setIsHistoryPanelOpen((prev) => !prev),
    onToggleLlmSettings: () => setIsLlmSettingsOpen((prev) => !prev),
    onToggleAiAssistant: () => setIsAiAssistantOpen((prev) => !prev),
    onCloseActiveTab: () => {
      if (activeSessionId) handleCloseSession(activeSessionId);
    },
    onOpenNewConnection: openNewConnection,
    onSwitchToTabIndex: (index) => {
      const target = sessions[index];
      if (target) setActiveSessionId(target.id);
    },
    onSwitchToPrevTab: () => {
      if (!activeSessionId || sessions.length === 0) return;
      const idx = sessions.findIndex((s) => s.id === activeSessionId);
      const prev = sessions[(idx - 1 + sessions.length) % sessions.length];
      if (prev) setActiveSessionId(prev.id);
    },
    onSwitchToNextTab: () => {
      if (!activeSessionId || sessions.length === 0) return;
      const idx = sessions.findIndex((s) => s.id === activeSessionId);
      const next = sessions[(idx + 1) % sessions.length];
      if (next) setActiveSessionId(next.id);
    },
  });

  return (
    <div className="flex min-h-screen bg-[#111214]">
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
        onOpenCsvImport={() => setIsCsvImportOpen(true)}
        onRenameGroup={handleRequestRenameGroup}
        onSelectProfile={handleSelectProfile}
        onSelectSession={setActiveSessionId}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        onOpenSettings={() => navigate('/settings')}
        selectedProfileId={selectedProfileId}
        sessions={sessions}
      />

      <TerminalWorkspace
        ref={terminalWorkspaceRef}
        activeSessionId={activeSessionId}
        onCloseSession={handleCloseSession}
        onOpenNewConnection={openNewConnection}
        onSelectSession={setActiveSessionId}
        onSessionStatusChange={handleSessionStatusChange}
        onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        sidebarCollapsed={isSidebarCollapsed}
        sessions={sessions}
      />

      <ConnectionPanel
        canDelete={selectedProfileId !== null}
        currentNodeId={selectedProfileId}
        errorMessage={modalError}
        formValues={formValues}
        isSubmitting={isSubmittingConnection}
        onChange={handleFormChange}
        onClose={() => setIsConnectionPanelOpen(false)}
        onConnect={handleConnect}
        onDelete={handleRequestDeleteSelectedProfile}
        onSaveOnly={handleSaveOnly}
        open={isConnectionPanelOpen}
        savedProfiles={savedProfiles}
        title={selectedProfileId ? '连接配置' : '新建连接'}
      />

      <ConfirmDialog
        confirmLabel={isSubmittingConnection ? '删除中...' : '删除节点'}
        description={
          pendingDeleteProfile
            ? `删除节点「${pendingDeleteProfile.name}」后将无法恢复，相关会话也会被关闭。`
            : ''
        }
        destructive
        errorMessage={deleteDialogError}
        onClose={() => {
          setDeleteDialogError(null);
          setPendingDeleteProfile(null);
        }}
        onConfirm={() => {
          if (!pendingDeleteProfile) {
            return;
          }

          void handleDeleteNode(pendingDeleteProfile);
        }}
        open={pendingDeleteProfile !== null}
        title="确认删除"
      />

      <ConfirmDialog
        confirmLabel={isSubmittingGroupAction ? '删除中...' : '删除分组'}
        description={
          pendingDeleteGroup
            ? `删除分组「${pendingDeleteGroup.name}」后，其中的主机会自动移动到默认分组。`
            : ''
        }
        destructive
        errorMessage={deleteDialogError}
        onClose={() => {
          setDeleteDialogError(null);
          setPendingDeleteGroup(null);
        }}
        onConfirm={() => {
          void handleConfirmDeleteGroup();
        }}
        open={pendingDeleteGroup !== null}
        title="确认删除分组"
      />

      <GroupNameDialog
        confirmLabel={groupDialogMode === 'rename' ? '保存分组' : '新建分组'}
        description={
          groupDialogMode === 'rename'
            ? '修改分组名称后，左侧分组树会立即更新。'
            : '创建分组后，可以把主机移动到该分组下。'
        }
        errorMessage={groupDialogError}
        isSubmitting={isSubmittingGroupAction}
        onClose={() => {
          setGroupDialogMode(null);
          setGroupDialogTarget(null);
          setGroupDialogName('');
          setGroupDialogError(null);
        }}
        onConfirm={() => {
          void handleConfirmGroupDialog();
        }}
        onValueChange={(value) => {
          setGroupDialogName(value);
          setGroupDialogError(null);
        }}
        open={groupDialogMode !== null}
        title={groupDialogMode === 'rename' ? '重命名分组' : '新建分组'}
        value={groupDialogName}
      />

      <MoveProfileDialog
        errorMessage={moveDialogError}
        groups={groupedProfiles}
        isSubmitting={isSubmittingGroupAction}
        onClose={() => {
          setMoveDialogProfile(null);
          setMoveDialogTargetGroupId(null);
          setMoveDialogError(null);
        }}
        onConfirm={() => {
          void handleConfirmMoveProfileToGroup();
        }}
        onSelectGroup={(groupId) => {
          setMoveDialogTargetGroupId(groupId);
          setMoveDialogError(null);
        }}
        open={moveDialogProfile !== null}
        profile={moveDialogProfile}
        selectedGroupId={moveDialogTargetGroupId}
      />

      <QuickConnectModal
        onClose={() => setIsQuickConnectOpen(false)}
        onConnect={(profile) => {
          setIsQuickConnectOpen(false);
          handleActivateProfile(profile);
        }}
        open={isQuickConnectOpen}
        profiles={savedProfiles}
      />

      <CommandHistoryPanel
        open={isHistoryPanelOpen}
        activeNodeId={sessions.find((s) => s.id === activeSessionId)?.nodeId}
        onClose={() => setIsHistoryPanelOpen(false)}
        onExecute={(command) => {
          terminalWorkspaceRef.current?.sendCommandToActive(command);
          setIsHistoryPanelOpen(false);
        }}
      />

      <LlmProviderSettings
        open={isLlmSettingsOpen}
        onClose={() => setIsLlmSettingsOpen(false)}
        onProviderChange={reloadDefaultProvider}
      />

      <AiAssistantPanel
        open={isAiAssistantOpen}
        providerId={defaultProviderId}
        onClose={() => setIsAiAssistantOpen(false)}
      />

      <CsvImportModal
        open={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        onSuccess={refreshWorkspaceDataInBackground}
      />
    </div>
  );
}
