import { useEffect, useState } from 'react';

import { fetchLlmProviders } from './api';
import {
  loadAgentMaxSteps,
  normalizeAgentMaxSteps,
  saveAgentMaxSteps,
} from './agentRunSettings';
import {
  AI_ASSISTANT_PANEL_DEFAULT_WIDTH,
  type AiAssistantMode,
  type AiAssistantModelOption,
  buildAiAssistantModelOptions,
  clampAiAssistantPanelWidth,
  getPreferredAiAssistantModelValue,
  getValidAiAssistantModelValue,
  getValidAiAssistantSessionId,
  shouldEnableAiAssistantSend,
} from './aiAssistantPanelModel';
import type { LiveSession } from './types';

type UseAiAssistantPanelStateOptions = {
  open: boolean;
  activeSessionId: string | null;
  sessions: LiveSession[];
  isAgentInputLocked?: boolean;
  isRunning: boolean;
  isStreaming: boolean;
};

export function useAiAssistantPanelState({
  open,
  activeSessionId,
  sessions,
  isAgentInputLocked = false,
  isRunning,
  isStreaming,
}: UseAiAssistantPanelStateOptions) {
  const [mode, setMode] = useState<AiAssistantMode>('agent');
  const [input, setInput] = useState('');
  const [modelOptions, setModelOptions] = useState<AiAssistantModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedAgentMaxSteps, setSelectedAgentMaxStepsState] = useState(() => loadAgentMaxSteps());
  const [width, setWidth] = useState(AI_ASSISTANT_PANEL_DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      document.body.style.userSelect = '';
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      setWidth(clampAiAssistantPanelWidth(document.body.clientWidth - event.clientX));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    void fetchLlmProviders().then((providers) => {
      if (cancelled) {
        return;
      }

      const nextModelOptions = buildAiAssistantModelOptions(providers);
      const preferredModel = getPreferredAiAssistantModelValue(providers);
      setModelOptions(nextModelOptions);
      setSelectedModel((current) =>
        getValidAiAssistantModelValue(
          nextModelOptions,
          current || preferredModel
        )
      );
    });

    setSelectedSessionId((current) =>
      getValidAiAssistantSessionId(sessions, current, activeSessionId)
    );

    return () => {
      cancelled = true;
    };
  }, [open, activeSessionId, sessions]);

  const isBusy = mode === 'agent' ? isRunning || isAgentInputLocked : isStreaming;
  const resolvedSelectedModel = getValidAiAssistantModelValue(modelOptions, selectedModel);
  const resolvedSelectedSessionId = getValidAiAssistantSessionId(
    sessions,
    selectedSessionId,
    activeSessionId
  );

  const setSelectedAgentMaxSteps = (value: number) => {
    const normalizedValue = normalizeAgentMaxSteps(value);
    setSelectedAgentMaxStepsState(normalizedValue);
    saveAgentMaxSteps(normalizedValue);
  };

  return {
    canSend: shouldEnableAiAssistantSend({
      input,
      isBusy,
      mode,
      selectedModel: resolvedSelectedModel,
      selectedSessionId: resolvedSelectedSessionId,
    }),
    input,
    isDragging,
    mode,
    modelOptions,
    selectedModel,
    selectedAgentMaxSteps,
    selectedSessionId,
    setSelectedAgentMaxSteps,
    setInput,
    setMode,
    setSelectedModel,
    setSelectedSessionId,
    startDragging: () => setIsDragging(true),
    width,
  };
}
