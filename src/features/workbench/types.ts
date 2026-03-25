export type AuthMode = 'password' | 'privateKey';

export type SavedConnectionProfile = {
  id: string;
  name: string;
  groupId: string | null;
  group: string;
  jumpHostId: string | null;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  note: string;
};

export type SavedConnectionGroup = {
  id: string;
  name: string;
  isDefault: boolean;
  profiles: SavedConnectionProfile[];
};

export type ConnectionFormValues = {
  label: string;
  host: string;
  port: string;
  username: string;
  authMode: AuthMode;
  password: string;
  privateKey: string;
  passphrase: string;
  jumpHostId: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'closed' | 'reconnecting';

export type LiveSession = {
  id: string;
  label: string;
  nodeId?: string;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  status: ConnectionStatus;
  errorMessage?: string;
};
