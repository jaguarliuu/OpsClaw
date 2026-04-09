import { formatWorkbenchShortcutLabel } from './workbenchShortcutModel';
import type { SplitLayout } from './workbenchTerminalWorkspaceModel';

export type WorkbenchToolActionId = 'helpDialog' | 'aiAssistant';
export type WorkbenchLayoutActionId = SplitLayout;
export type WorkbenchActionTone = 'active' | 'idle' | 'accent';

export type WorkbenchToolAction = {
  behavior: 'openHelpDialog' | 'openAiAssistant';
  display: 'label' | 'icon';
  icon: 'sparkles' | null;
  id: WorkbenchToolActionId;
  isActive: boolean;
  label: string;
  shortcutLabel: string;
  tone: WorkbenchActionTone;
  title: string;
  variant: 'ghost';
};

export type WorkbenchLayoutAction = {
  behavior: 'exitSplitMode' | 'enterSplitMode';
  icon: 'single' | 'horizontal' | 'vertical';
  id: WorkbenchLayoutActionId;
  isActive: boolean;
  targetLayout?: 'horizontal' | 'vertical';
  tone: WorkbenchActionTone;
  title: string;
};

export function buildWorkbenchToolActions(input: {
  isMacShortcutPlatform: boolean;
}): WorkbenchToolAction[] {
  const aiAssistantShortcutLabel = formatWorkbenchShortcutLabel(
    'toggleAiAssistant',
    input.isMacShortcutPlatform
  );

  return [
    {
      behavior: 'openHelpDialog',
      display: 'label',
      icon: null,
      id: 'helpDialog',
      isActive: false,
      label: '?',
      shortcutLabel: '',
      tone: 'idle',
      title: '帮助与快捷键',
      variant: 'ghost',
    },
    {
      behavior: 'openAiAssistant',
      display: 'icon',
      icon: 'sparkles',
      id: 'aiAssistant',
      isActive: false,
      label: 'AI 助手',
      shortcutLabel: aiAssistantShortcutLabel,
      tone: 'accent',
      title: `AI 助手 (${aiAssistantShortcutLabel})`,
      variant: 'ghost',
    },
  ];
}

export function buildWorkbenchLayoutActions(splitLayout: SplitLayout): WorkbenchLayoutAction[] {
  return [
    {
      behavior: 'exitSplitMode',
      icon: 'single',
      id: 'single',
      isActive: splitLayout === 'single',
      tone: splitLayout === 'single' ? 'active' : 'idle',
      title: '单屏',
    },
    {
      behavior: 'enterSplitMode',
      icon: 'horizontal',
      id: 'horizontal',
      isActive: splitLayout === 'horizontal',
      targetLayout: 'horizontal',
      tone: splitLayout === 'horizontal' ? 'active' : 'idle',
      title: '左右分屏',
    },
    {
      behavior: 'enterSplitMode',
      icon: 'vertical',
      id: 'vertical',
      isActive: splitLayout === 'vertical',
      targetLayout: 'vertical',
      tone: splitLayout === 'vertical' ? 'active' : 'idle',
      title: '上下分屏',
    },
  ];
}

export function performWorkbenchLayoutAction(
  action: WorkbenchLayoutAction,
  handlers: {
    onEnterSplitMode: (layout: 'horizontal' | 'vertical') => void;
    onExitSplitMode: () => void;
  }
) {
  if (action.behavior === 'exitSplitMode') {
    handlers.onExitSplitMode();
    return;
  }

  handlers.onEnterSplitMode(action.targetLayout!);
}

export function performWorkbenchToolAction(
  action: WorkbenchToolAction,
  handlers: {
    onOpenAiAssistant: () => void;
    onOpenHelpDialog: () => void;
  }
) {
  if (action.behavior === 'openHelpDialog') {
    handlers.onOpenHelpDialog();
    return;
  }

  handlers.onOpenAiAssistant();
}

export function getWorkbenchActionClassName(tone: WorkbenchActionTone) {
  switch (tone) {
    case 'active':
      return 'bg-neutral-700 text-neutral-100 hover:bg-neutral-600';
    case 'accent':
      return 'text-neutral-400 hover:text-blue-400';
    default:
      return 'text-neutral-400 hover:text-neutral-100';
  }
}
