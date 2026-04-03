import { lazy } from 'react';

export const LazyConnectionPanel = lazy(async () => {
  const module = await import('./ConnectionPanel');
  return { default: module.ConnectionPanel };
});

export const LazyHelpDialog = lazy(async () => {
  const module = await import('./HelpDialog');
  return { default: module.HelpDialog };
});

export const LazyAiAssistantPanel = lazy(async () => {
  const module = await import('./AiAssistantPanel');
  return { default: module.AiAssistantPanel };
});

export const LazyCommandHistoryPanel = lazy(async () => {
  const module = await import('./CommandHistoryPanel');
  return { default: module.CommandHistoryPanel };
});

export const LazyQuickConnectModal = lazy(async () => {
  const module = await import('./QuickConnectModal');
  return { default: module.QuickConnectModal };
});

export const LazyCsvImportModal = lazy(async () => {
  const module = await import('./CsvImportModal');
  return { default: module.CsvImportModal };
});

export const LazyTerminalSettingsPanel = lazy(async () => {
  const module = await import('./TerminalSettingsPanel');
  return { default: module.TerminalSettingsPanel };
});

export const LazyConfirmDialog = lazy(async () => {
  const module = await import('@/components/ui/confirm-dialog');
  return { default: module.ConfirmDialog };
});

export const LazyGroupNameDialog = lazy(async () => {
  const module = await import('./GroupDialogs');
  return { default: module.GroupNameDialog };
});

export const LazyMoveProfileDialog = lazy(async () => {
  const module = await import('./GroupDialogs');
  return { default: module.MoveProfileDialog };
});
