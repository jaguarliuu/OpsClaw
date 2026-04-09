import { formatWorkbenchShortcutLabel } from './workbenchShortcutModel';

export type HelpDialogShortcut = {
  key: string;
  label: string;
};

export type HelpDialogContent = {
  title: string;
  description: string;
  introduction: string[];
  coreFeatures: string[];
  shortcuts: HelpDialogShortcut[];
  usageTips: string[];
};

export function buildHelpDialogContent(isMacShortcutPlatform: boolean): HelpDialogContent {
  return {
    title: '帮助与快捷键',
    description: '在一个地方快速了解 OpsClaw 的核心能力、常用入口和全局快捷键。',
    introduction: [
      'OpsClaw 是一个 AI-native 运维工作台，把连接管理、终端执行、脚本库和 AI 协作收在同一个桌面应用里。',
      '第一次使用时，建议先从新建连接开始，再结合 AI 助手、设置页中的脚本能力和会话标签完成日常操作。',
    ],
    coreFeatures: [
      '连接管理：统一维护节点、分组和跳板机配置。',
      '多会话终端：同时打开多个 SSH 会话，并支持单屏和分屏切换。',
      'AI 协作：在 Agent / Chat 里分析问题、生成命令和推进排障。',
      '脚本库：沉淀全局脚本、节点覆盖脚本和脚本别名（alias）。',
    ],
    shortcuts: [
      {
        key: formatWorkbenchShortcutLabel('openNewConnection', isMacShortcutPlatform),
        label: '新建连接',
      },
      {
        key: formatWorkbenchShortcutLabel('toggleAiAssistant', isMacShortcutPlatform),
        label: '打开 AI 助手',
      },
      {
        key: formatWorkbenchShortcutLabel('toggleCommandHistory', isMacShortcutPlatform),
        label: '打开命令历史',
      },
      {
        key: formatWorkbenchShortcutLabel('toggleLlmSettings', isMacShortcutPlatform),
        label: '打开模型设置',
      },
      {
        key: formatWorkbenchShortcutLabel('closeActiveTab', isMacShortcutPlatform),
        label: '关闭当前标签',
      },
      {
        key: formatWorkbenchShortcutLabel('switchToPrevTab', isMacShortcutPlatform),
        label: '切换到上一个标签',
      },
      {
        key: formatWorkbenchShortcutLabel('switchToNextTab', isMacShortcutPlatform),
        label: '切换到下一个标签',
      },
    ],
    usageTips: [
      '终端区支持右键菜单、复制粘贴和命令历史调用。',
      '输入命令时，Tab 可接受当前命令补全建议。',
      '复杂操作优先使用 Agent 模式，让 AI 持续推进任务。',
      '脚本支持 alias，终端中输入 x alias 并回车，可快速执行对应脚本。',
      '脚本库支持全局脚本和节点覆盖脚本，适合沉淀固定操作。',
    ],
  };
}
