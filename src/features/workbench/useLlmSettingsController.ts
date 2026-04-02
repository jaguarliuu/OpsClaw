import { useEffect, useState } from 'react';

import {
  createLlmProvider,
  deleteLlmProvider,
  fetchLlmProviders,
  setDefaultLlmProvider,
  updateLlmProvider,
} from './api';
import {
  buildInitialLlmProviderFormData,
  buildLlmProviderEditFormData,
  buildLlmProviderSavePlan,
  planLlmProviderTypeChange,
  type LlmProviderFormData,
} from './llmSettingsModel';
import {
  buildLlmSettingsDeleteErrorMessage,
  buildLlmSettingsLoadingErrorMessage,
  buildLlmSettingsProviderTypeChangeConfirmMessage,
  buildLlmSettingsResetState,
  buildLlmSettingsSaveErrorMessage,
  buildLlmSettingsSetDefaultErrorMessage,
  deleteLlmSettingsProviderAndReload,
  loadLlmSettingsProviders,
  saveLlmSettingsProviderAndReload,
  setDefaultLlmSettingsProviderAndReload,
} from './llmSettingsControllerModel';
import type { LlmProvider, LlmProviderType } from './types';

export function useLlmSettingsController() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [formData, setFormData] = useState<LlmProviderFormData>(() =>
    buildInitialLlmProviderFormData()
  );

  useEffect(() => {
    void loadLlmSettingsProviders({
      fetchProviders: fetchLlmProviders,
    })
      .then(setProviders)
      .catch((error) => {
        console.error(buildLlmSettingsLoadingErrorMessage(), error);
      });
  }, []);

  const resetForm = () => {
    const resetState = buildLlmSettingsResetState();
    setEditing(resetState.editing);
    setHasSavedApiKey(resetState.hasSavedApiKey);
    setCustomModelInput(resetState.customModelInput);
    setFormData(buildInitialLlmProviderFormData());
  };

  const handleProviderTypeChange = (nextProviderType: LlmProviderType) => {
    if (nextProviderType === formData.providerType) {
      return;
    }

    const changePlan = planLlmProviderTypeChange(formData, nextProviderType);

    if (
      changePlan.requiresConfirmation &&
      !window.confirm(buildLlmSettingsProviderTypeChangeConfirmMessage())
    ) {
      return;
    }

    setFormData(changePlan.nextFormData);
    setCustomModelInput('');
  };

  const handleSave = async () => {
    try {
      const savePlan = buildLlmProviderSavePlan(formData, {
        editingId: editing,
        hasSavedApiKey,
        providerCount: providers.length,
      });

      const nextProviders = await saveLlmSettingsProviderAndReload(savePlan, {
        createProvider: createLlmProvider,
        fetchProviders: fetchLlmProviders,
        setDefaultProvider: setDefaultLlmProvider,
        updateProvider: updateLlmProvider,
      });
      setProviders(nextProviders);
      resetForm();
    } catch (error) {
      console.error(buildLlmSettingsSaveErrorMessage(), error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const nextProviders = await deleteLlmSettingsProviderAndReload(id, {
        deleteProvider: deleteLlmProvider,
        fetchProviders: fetchLlmProviders,
      });
      setProviders(nextProviders);
    } catch (error) {
      console.error(buildLlmSettingsDeleteErrorMessage(), error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const nextProviders = await setDefaultLlmSettingsProviderAndReload(id, {
        fetchProviders: fetchLlmProviders,
        setDefaultProvider: setDefaultLlmProvider,
      });
      setProviders(nextProviders);
    } catch (error) {
      console.error(buildLlmSettingsSetDefaultErrorMessage(), error);
    }
  };

  const handleEdit = (provider: LlmProvider) => {
    setEditing(provider.id);
    setHasSavedApiKey(provider.hasApiKey);
    setCustomModelInput('');
    setFormData(buildLlmProviderEditFormData(provider));
  };

  return {
    customModelInput,
    editing,
    formData,
    hasSavedApiKey,
    providers,
    resetForm,
    setCustomModelInput,
    setFormData,
    handleDelete,
    handleEdit,
    handleProviderTypeChange,
    handleSave,
    handleSetDefault,
  };
}
