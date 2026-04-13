import type { TerminalSuggestionItem } from './sshTerminalSuggestionOverlayModel.js';

type TerminalShortcutEvent = {
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  metaKey: boolean;
  type: string;
};

export type SshTerminalImeState = {
  isComposing: boolean;
  suppressEnterUntil: number;
};

type ShouldBlockSshTerminalCompositionConfirmOptions = TerminalShortcutEvent & {
  imeState: SshTerminalImeState;
  now: number;
};

export const SSH_TERMINAL_IME_CONFIRM_SUPPRESSION_MS = 64;

type ResolveSshTerminalInputOptions = {
  currentSuggestion: string | null;
  data: string;
  inputBuffer: string;
};

export type ResolvedSshTerminalInput = {
  commandToRecord: string | null;
  forwardedInput: string;
  nextInputBuffer: string;
  nextSuggestion: string | null;
  suggestionQuery: string | null;
};

export type SshTerminalQuickScriptOverlayState = {
  quickScriptItems: TerminalSuggestionItem[];
  quickScriptVisible: boolean;
  quickScriptSelectedIndex: number;
};

const SAFE_SINGLE_TOKEN_COMMANDS = new Set([
  'ls',
  'cd',
  'pwd',
  'top',
  'htop',
  'vim',
  'vi',
  'nano',
  'cat',
  'less',
  'more',
  'tail',
  'head',
  'grep',
  'find',
  'ps',
  'df',
  'du',
  'free',
  'clear',
  'exit',
  'history',
  'ssh',
  'scp',
  'curl',
  'wget',
  'git',
  'docker',
  'kubectl',
  'systemctl',
  'journalctl',
  'service',
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'apk',
  'bash',
  'sh',
  'zsh',
  'python',
  'python3',
  'node',
  'npm',
  'pnpm',
  'mysql',
  'redis-cli',
  'tmux',
  'screen',
  'whoami',
  'uname',
  'env',
  'printenv',
]);

const SENSITIVE_PROMPT_PATTERN =
  /(password|passphrase|verification code|otp|one-time password|token|secret|api key)[^\\n\\r]{0,48}[:：]\s*$/i;

const SENSITIVE_COMMAND_PATTERN =
  /(^|\s)(?:[A-Z_]*?(?:PASSWORD|PASSWD|PASSPHRASE|TOKEN|SECRET|API_KEY))=|--(?:password|passwd|passphrase|token|secret|api-key)(?:=|\s+)|https?:\/\/[^/\s:@]+:[^/\s@]+@/i;

function normalizeTerminalTail(text: string) {
  return text.slice(-240).replace(/\r/g, '\n');
}

function isSingleTokenCommand(command: string) {
  return !/\s/.test(command);
}

function looksLikeStandaloneSecretValue(command: string) {
  if (!isSingleTokenCommand(command)) {
    return false;
  }

  const normalized = command.trim().toLowerCase();
  if (!normalized || SAFE_SINGLE_TOKEN_COMMANDS.has(normalized)) {
    return false;
  }

  if (!/^[a-z0-9._@-]{4,128}$/i.test(normalized)) {
    return false;
  }

  return true;
}

export function shouldToggleSshTerminalSearchShortcut(
  event: TerminalShortcutEvent
) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'f' &&
    event.type === 'keydown'
  );
}

export function resolveSshTerminalClipboardShortcut(input: {
  event: TerminalShortcutEvent;
  hasSelection: boolean;
}) {
  const { event, hasSelection } = input;
  if (event.type !== 'keydown' || (!event.ctrlKey && !event.metaKey)) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'c') {
    return hasSelection ? 'copy-selection' : null;
  }

  if (key === 'v') {
    return 'paste-from-clipboard';
  }

  return null;
}

export function shouldConfirmSshTerminalPaste(text: string) {
  return text.includes('\n');
}

export function hasSensitiveTerminalPrompt(transcriptTail: string) {
  return SENSITIVE_PROMPT_PATTERN.test(normalizeTerminalTail(transcriptTail));
}

export function isSearchableCommandHistoryEntry(command: string) {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  if (SENSITIVE_COMMAND_PATTERN.test(normalized)) {
    return false;
  }

  if (looksLikeStandaloneSecretValue(normalized)) {
    return false;
  }

  return true;
}

export function shouldRecordSshTerminalCommand(input: {
  command: string;
  transcriptTail: string;
}) {
  const normalized = input.command.trim();
  if (!normalized) {
    return false;
  }

  if (hasSensitiveTerminalPrompt(input.transcriptTail)) {
    return false;
  }

  return isSearchableCommandHistoryEntry(normalized);
}

export function createSshTerminalImeState(): SshTerminalImeState {
  return {
    isComposing: false,
    suppressEnterUntil: 0,
  };
}

export function markSshTerminalImeCompositionStart(
  state: SshTerminalImeState
): SshTerminalImeState {
  return {
    ...state,
    isComposing: true,
    suppressEnterUntil: 0,
  };
}

export function markSshTerminalImeCompositionEnd(
  state: SshTerminalImeState,
  now: number
): SshTerminalImeState {
  return {
    ...state,
    isComposing: false,
    suppressEnterUntil: now + SSH_TERMINAL_IME_CONFIRM_SUPPRESSION_MS,
  };
}

export function shouldBlockSshTerminalCompositionConfirm({
  imeState,
  now,
  ...event
}: ShouldBlockSshTerminalCompositionConfirmOptions) {
  return (
    event.type === 'keydown' &&
    event.key === 'Enter' &&
    (
      event.isComposing === true ||
      event.keyCode === 229 ||
      imeState.isComposing ||
      now < imeState.suppressEnterUntil
    )
  );
}

export function resolveSshTerminalInput({
  currentSuggestion,
  data,
  inputBuffer,
}: ResolveSshTerminalInputOptions): ResolvedSshTerminalInput {
  if (data === '\t' && currentSuggestion && inputBuffer) {
    const remaining = currentSuggestion.slice(inputBuffer.length);
    if (remaining) {
      return {
        commandToRecord: null,
        forwardedInput: remaining,
        nextInputBuffer: currentSuggestion,
        nextSuggestion: null,
        suggestionQuery: null,
      };
    }
  }

  if (data === '\r' || data === '\n') {
    const commandToRecord = inputBuffer.trim();
    return {
      commandToRecord: commandToRecord || null,
      forwardedInput: data,
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    };
  }

  if (data === '\x7f' || data === '\x08') {
    const nextInputBuffer = inputBuffer.slice(0, -1);
    return {
      commandToRecord: null,
      forwardedInput: data,
      nextInputBuffer,
      nextSuggestion: currentSuggestion,
      suggestionQuery: nextInputBuffer,
    };
  }

  if (data === '\x15' || data === '\x03' || data === '\x1c') {
    return {
      commandToRecord: null,
      forwardedInput: data,
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    };
  }

  if (data === '\x17') {
    const nextInputBuffer = inputBuffer.replace(/\s*\S+\s*$/, '');
    return {
      commandToRecord: null,
      forwardedInput: data,
      nextInputBuffer,
      nextSuggestion: currentSuggestion,
      suggestionQuery: nextInputBuffer,
    };
  }

  if (data.startsWith('\x1b')) {
    return {
      commandToRecord: null,
      forwardedInput: data,
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    };
  }

  if (data >= ' ' && data !== '\t') {
    const nextInputBuffer = inputBuffer + data;
    return {
      commandToRecord: null,
      forwardedInput: data,
      nextInputBuffer,
      nextSuggestion: currentSuggestion,
      suggestionQuery: nextInputBuffer,
    };
  }

  return {
    commandToRecord: null,
    forwardedInput: data,
    nextInputBuffer: inputBuffer,
    nextSuggestion: currentSuggestion,
    suggestionQuery: null,
  };
}
