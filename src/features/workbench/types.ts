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
  hasSavedPassword: boolean;
  privateKey: string;
  hasSavedPrivateKey: boolean;
  passphrase: string;
  hasSavedPassphrase: boolean;
  jumpHostId: string;
};

export type CommandRecord = {
  id: string;
  command: string;
  nodeId: string | null;
  rank: number;
  lastUsed: number; // Unix ms
};

export type TerminalCommandExecutionResult = {
  command: string;
  output: string;
  exitCode: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
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

export type LlmProviderType = 'zhipu' | 'minimax' | 'qwen' | 'deepseek' | 'openai_compatible';

export type LlmProvider = {
  id: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string | null;
  apiKey: string;
  hasApiKey: boolean;
  models: string[];
  defaultModel: string | null;
  enabled: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
};

export type LlmMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type LlmStreamChunk = {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
};

export type MemoryScope = 'global' | 'group' | 'node';

export type MemoryDocument = {
  scope: MemoryScope;
  id: string | null;
  title: string;
  path: string;
  content: string;
  exists: boolean;
  updatedAt: string | null;
};

export type ScriptScope = 'global' | 'node';
export type ScriptKind = 'plain' | 'template';
export type ScriptVariableInputType = 'text' | 'textarea';

export type ScriptVariableDefinition = {
  name: string;
  label: string;
  inputType: ScriptVariableInputType;
  required: boolean;
  defaultValue: string;
  placeholder: string;
};

export type ScriptLibraryItem = {
  id: string;
  key: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
  resolvedFrom: ScriptScope;
  overridesGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScriptLibraryUpsertInput = {
  key: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
};

export type OpsClawDesktopRuntime = {
  desktop: boolean;
  serverHttpBaseUrl: string;
  serverWebSocketBaseUrl: string;
};

declare global {
  interface Window {
    __OPSCLAW_RUNTIME__?: OpsClawDesktopRuntime;
  }
}
