import { lazy } from 'react';

export const LazyTerminalSettingsTab = lazy(async () => {
  const module = await import('@/features/workbench/TerminalSettingsTab');
  return { default: module.TerminalSettingsTab };
});

export const LazyLlmSettings = lazy(async () => {
  const module = await import('@/features/workbench/LlmSettings');
  return { default: module.LlmSettings };
});

export const LazyMemorySettings = lazy(async () => {
  const module = await import('@/features/workbench/MemorySettings');
  return { default: module.MemorySettings };
});

export const LazyScriptSettingsTab = lazy(async () => {
  const module = await import('@/features/workbench/ScriptSettingsTab');
  return { default: module.ScriptSettingsTab };
});
