import type {
  GroupRecord,
  NodeDetailRecord,
  NodeSummaryRecord,
  NodeUpsertInput,
} from './api';
import type {
  ConnectionFormValues,
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from './types';

export const defaultGroupName = '默认';

export const defaultFormValues: ConnectionFormValues = {
  label: '',
  host: '',
  port: '22',
  username: '',
  authMode: 'password',
  password: '',
  hasSavedPassword: false,
  privateKey: '',
  hasSavedPrivateKey: false,
  passphrase: '',
  hasSavedPassphrase: false,
  jumpHostId: '',
};

export function mapNodeToProfile(node: NodeSummaryRecord): SavedConnectionProfile {
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

export function mapNodeDetailToFormValues(node: NodeDetailRecord): ConnectionFormValues {
  return {
    label: node.name,
    host: node.host,
    port: String(node.port),
    username: node.username,
    authMode: node.authMode,
    password: '',
    hasSavedPassword: node.hasPassword,
    privateKey: '',
    hasSavedPrivateKey: node.hasPrivateKey,
    passphrase: '',
    hasSavedPassphrase: node.hasPassphrase,
    jumpHostId: node.jumpHostId ?? '',
  };
}

export function buildGroupTree(
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

export function upsertProfile(
  profiles: SavedConnectionProfile[],
  nextProfile: SavedConnectionProfile
) {
  const existingIndex = profiles.findIndex((profile) => profile.id === nextProfile.id);
  if (existingIndex === -1) {
    return [...profiles, nextProfile];
  }

  return profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile));
}

export function validateForm(formValues: ConnectionFormValues) {
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
    if (formValues.hasSavedPassword) {
      return null;
    }
    return '密码验证必须填写密码。';
  }

  if (formValues.authMode === 'privateKey' && !formValues.privateKey.trim()) {
    if (formValues.hasSavedPrivateKey) {
      return null;
    }
    return '密钥验证必须填写私钥。';
  }

  return null;
}

export function buildNodeInput(
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
    password:
      formValues.authMode === 'password' && formValues.password.trim()
        ? formValues.password
        : undefined,
    privateKey:
      formValues.authMode === 'privateKey' && formValues.privateKey.trim()
        ? formValues.privateKey
        : undefined,
    passphrase:
      formValues.authMode === 'privateKey' && formValues.passphrase.trim()
        ? formValues.passphrase
        : undefined,
    note: formValues.authMode === 'password' ? '密码连接' : '密钥连接',
  };
}

export function buildSessionFromProfile(profile: SavedConnectionProfile): LiveSession {
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
