import { LlmProviderBasicsSection } from './LlmProviderBasicsSection';
import { LlmProviderListSection } from './LlmProviderListSection';
import { LlmProviderModelSection } from './LlmProviderModelSection';
import { LlmProviderSubmitSection } from './LlmProviderSubmitSection';
import { getLlmProviderTemplate } from './llmProviderTemplates';
import {
  addLlmProviderFormModel,
  buildLlmProviderBasicsSectionViewModel,
  buildLlmProviderListSectionViewModel,
  buildLlmProviderModelSectionViewModel,
  buildLlmProviderSubmitSectionViewModel,
  canSaveLlmProviderForm,
  removeLlmProviderFormModel,
} from './llmSettingsModel';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
} from './settingsTheme';
import { useLlmSettingsController } from './useLlmSettingsController';

export function LlmSettings() {
  const {
    customModelInput,
    editing,
    formData,
    handleDelete,
    handleEdit,
    handleProviderTypeChange,
    handleSave,
    handleSetDefault,
    hasSavedApiKey,
    providers,
    resetForm,
    setCustomModelInput,
    setFormData,
  } = useLlmSettingsController();

  const activeTemplate = getLlmProviderTemplate(formData.providerType);

  const addModel = (modelName: string) => {
    setFormData((current) => addLlmProviderFormModel(current, modelName));
  };

  const removeModel = (modelName: string) => {
    setFormData((current) => removeLlmProviderFormModel(current, modelName));
  };

  const handleAddCustomModel = () => {
    addModel(customModelInput);
    setCustomModelInput('');
  };

  const canSave = canSaveLlmProviderForm(formData, {
    editingId: editing,
    hasSavedApiKey,
  });
  const listSectionViewModel = buildLlmProviderListSectionViewModel(providers);
  const basicsSectionViewModel = buildLlmProviderBasicsSectionViewModel(formData, activeTemplate);
  const modelSectionViewModel = buildLlmProviderModelSectionViewModel(formData, activeTemplate);
  const submitSectionViewModel = buildLlmProviderSubmitSectionViewModel({
    editing: editing !== null,
    hasSavedApiKey,
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">已配置的提供商</h3>
          <p className={`mt-1 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>管理你的 LLM 服务提供商配置</p>
        </div>
        <LlmProviderListSection
          providers={providers}
          onDelete={(id) => {
            void handleDelete(id);
          }}
          onEdit={handleEdit}
          onSetDefault={(id) => {
            void handleSetDefault(id);
          }}
          viewModel={listSectionViewModel}
        />
      </div>

      <div>
        <div className="mb-6">
          <h3 className="text-base font-semibold tracking-tight">
            {editing ? '编辑提供商' : '添加新提供商'}
          </h3>
          <p className={`mt-1 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
            {editing ? '修改提供商配置信息' : '配置新的 LLM 服务提供商'}
          </p>
        </div>
        <div className={`${SETTINGS_PANEL_CLASS} space-y-6 p-6`}>
          <LlmProviderBasicsSection
            baseUrl={formData.baseUrl}
            name={formData.name}
            providerType={formData.providerType}
            onBaseUrlChange={(value) =>
              setFormData((current) => ({ ...current, baseUrl: value }))
            }
            onNameChange={(value) =>
              setFormData((current) => ({ ...current, name: value }))
            }
            onProviderTypeChange={handleProviderTypeChange}
            viewModel={basicsSectionViewModel}
          />

          <LlmProviderModelSection
            customModelInput={customModelInput}
            defaultModel={formData.defaultModel}
            onAddCustomModel={handleAddCustomModel}
            onCustomModelInputChange={setCustomModelInput}
            onCustomModelInputEnter={handleAddCustomModel}
            onDefaultModelChange={(value) =>
              setFormData((current) => ({ ...current, defaultModel: value }))
            }
            onPresetModelClick={addModel}
            onRemoveModel={removeModel}
            viewModel={modelSectionViewModel}
          />

          <LlmProviderSubmitSection
            apiKey={formData.apiKey}
            canSave={canSave}
            onApiKeyChange={(value) =>
              setFormData((current) => ({ ...current, apiKey: value }))
            }
            onCancel={resetForm}
            onSave={() => {
              void handleSave();
            }}
            viewModel={submitSectionViewModel}
          />
        </div>
      </div>
    </div>
  );
}
