export type SshTerminalContextMenuPosition = {
  x: number;
  y: number;
};

export type SshTerminalContextMenuState = {
  canCopySelection: boolean;
  x: number;
  y: number;
};

export type SshTerminalContextMenuAction =
  | 'copy-selection'
  | 'paste-from-clipboard'
  | 'select-all';

export type SshTerminalContextMenuItem = {
  action: SshTerminalContextMenuAction;
  disabled: boolean;
  label: string;
  tone: 'default' | 'disabled';
};

export function openSshTerminalContextMenuState(
  position: SshTerminalContextMenuPosition,
  options: {
    canCopySelection: boolean;
  }
): SshTerminalContextMenuState {
  return {
    canCopySelection: options.canCopySelection,
    x: position.x,
    y: position.y,
  };
}

export function closeSshTerminalContextMenuState() {
  return null;
}

export function buildSshTerminalContextMenuItems(input: {
  canCopySelection: boolean;
}): SshTerminalContextMenuItem[] {
  return [
    {
      action: 'copy-selection',
      disabled: !input.canCopySelection,
      label: '复制',
      tone: input.canCopySelection ? 'default' : 'disabled',
    },
    {
      action: 'paste-from-clipboard',
      disabled: false,
      label: '粘贴',
      tone: 'default',
    },
    {
      action: 'select-all',
      disabled: false,
      label: '全选',
      tone: 'default',
    },
  ];
}

export function shouldCloseSshTerminalContextMenuOnPointerDown(
  isPointerInsideMenu: boolean
) {
  return !isPointerInsideMenu;
}

export function shouldCloseSshTerminalContextMenuOnKeyDown(key: string) {
  return key === 'Escape';
}
