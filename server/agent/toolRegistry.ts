import type { Tool } from '@mariozechner/pi-ai';

import type {
  ToolAvailabilityContext,
  ToolHandler,
  ToolProvider,
  ToolRegistry,
} from './toolTypes.js';

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolHandler>();

  return {
    register(tool) {
      if (tools.has(tool.definition.name)) {
        throw new Error(`工具已注册：${tool.definition.name}`);
      }

      tools.set(tool.definition.name, tool);
    },

    registerProvider(provider: ToolProvider) {
      provider.register(this);
    },

    get(name: string) {
      return tools.get(name);
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
        name: handler.definition.name,
        description: handler.definition.description,
        parameters: handler.definition.parameters,
      }));
    },
  };
}
