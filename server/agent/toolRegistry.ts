import type { Tool } from '@mariozechner/pi-ai';

import type {
  ToolAvailabilityContext,
  ToolHandler,
  ToolProvider,
  ToolRegistry,
} from './toolTypes.js';
import { encodeToolNameForModel } from './toolNameCodec.js';

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolHandler>();
  const modelToCanonical = new Map<string, string>();
  const canonicalToModel = new Map<string, string>();

  return {
    register(tool) {
      if (tools.has(tool.definition.name)) {
        throw new Error(`工具已注册：${tool.definition.name}`);
      }

      const modelToolName = encodeToolNameForModel(tool.definition.name);
      const existingCanonical = modelToCanonical.get(modelToolName);
      if (existingCanonical && existingCanonical !== tool.definition.name) {
        throw new Error(
          `工具模型名称冲突：${tool.definition.name} 与 ${existingCanonical} -> ${modelToolName}`
        );
      }

      tools.set(tool.definition.name, tool);
      modelToCanonical.set(modelToolName, tool.definition.name);
      canonicalToModel.set(tool.definition.name, modelToolName);
    },

    registerProvider(provider: ToolProvider) {
      provider.register(this);
    },

    get(name: string) {
      return tools.get(name);
    },

    getByModelName(name: string) {
      const canonicalName = this.resolveCanonicalToolName(name);
      return canonicalName ? tools.get(canonicalName) : undefined;
    },

    resolveCanonicalToolName(name: string) {
      if (tools.has(name)) {
        return name;
      }

      return modelToCanonical.get(name);
    },

    getModelToolName(name: string) {
      return canonicalToModel.get(name) ?? encodeToolNameForModel(name);
    },

    listAll() {
      return Array.from(tools.values());
    },

    async listAvailable(ctx: ToolAvailabilityContext) {
      const available: ToolHandler[] = [];

      for (const tool of tools.values()) {
        if (tool.definition.enabledByDefault === false) {
          continue;
        }

        if (!tool.definition.isAvailable) {
          available.push(tool);
          continue;
        }

        const enabled = await tool.definition.isAvailable(ctx);
        if (enabled) {
          available.push(tool);
        }
      }

      return available;
    },

    async listPiTools(ctx: ToolAvailabilityContext) {
      const handlers = await this.listAvailable(ctx);
      return handlers.map<Tool>((handler) => ({
        name: this.getModelToolName(handler.definition.name),
        description: handler.definition.description,
        parameters: handler.definition.parameters,
      }));
    },
  };
}
