import { StringEnum, Type, type Static } from '@mariozechner/pi-ai';

import type { StoredNodeDetail } from '../../nodeStore.js';
import type { ToolHandler, ToolProvider } from '../toolTypes.js';

type FileMemoryProviderDependencies = {
  getNodeById: (id: string) => StoredNodeDetail | null;
  getGroupById: (id: string) => { id: string; name: string } | null;
};

const sessionScopeSchema = Type.Object({
  sessionId: Type.String({ minLength: 1, description: '当前 SSH 会话 ID' }),
});

const nodeMemorySchema = Type.Object({
  nodeId: Type.Optional(Type.String({ minLength: 1, description: '节点 ID；在当前会话节点场景下可省略' })),
});

const groupMemorySchema = Type.Object({
  groupId: Type.String({ minLength: 1, description: '分组 ID' }),
});

const memoryWriteMode = StringEnum(['append', 'replace'], {
  description: '写入模式：append 追加，replace 覆盖',
  default: 'append',
});

const writeNodeMemorySchema = Type.Object({
  nodeId: Type.Optional(
    Type.String({ minLength: 1, description: '节点 ID；在当前会话节点场景下可省略' })
  ),
  content: Type.String({ minLength: 1, description: '要写入记忆文档的 Markdown 内容' }),
  mode: Type.Optional(memoryWriteMode),
  reason: Type.Optional(Type.String({ description: '写入原因的简短说明' })),
});

function resolveNodeFromScope(
  nodeId: string | undefined,
  ctx: Parameters<ToolHandler['execute']>[1],
  getNodeById: FileMemoryProviderDependencies['getNodeById']
) {
  if (nodeId) {
    return getNodeById(nodeId);
  }

  const sessionId = ctx.sessionId;
  if (!sessionId) {
    throw new Error('未提供 nodeId，且当前运行上下文没有 session。');
  }

  const session = ctx.capabilities.sessions.getSession(sessionId);
  if (!session?.nodeId) {
    throw new Error('当前会话未绑定节点，无法定位节点记忆。');
  }

  const node = getNodeById(session.nodeId);
  if (!node) {
    throw new Error('当前会话关联的节点不存在。');
  }

  return node;
}

const writeGroupMemorySchema = Type.Object({
  groupId: Type.String({ minLength: 1, description: '分组 ID' }),
  content: Type.String({ minLength: 1, description: '要写入记忆文档的 Markdown 内容' }),
  mode: Type.Optional(memoryWriteMode),
  reason: Type.Optional(Type.String({ description: '写入原因的简短说明' })),
});

export function createFileMemoryToolProvider(
  dependencies: FileMemoryProviderDependencies
): ToolProvider {
  const readSessionContextMemoryTool: ToolHandler<typeof sessionScopeSchema> = {
    definition: {
      name: 'memory.read_session_context',
      description:
        '读取当前 SSH 会话关联的节点记忆和分组记忆。只有在近期全局记忆不足以回答问题时才调用。',
      parameters: sessionScopeSchema,
      category: 'system',
      riskLevel: 'safe',
      concurrencyMode: 'parallel-safe',
      version: '1.0.0',
      tags: ['memory', 'session', 'readonly'],
    },
    async execute(args, ctx) {
      const session = ctx.capabilities.sessions.getSession(args.sessionId);
      if (!session?.nodeId) {
        throw new Error('当前会话未绑定节点，无法读取节点或分组记忆。');
      }

      const node = dependencies.getNodeById(session.nodeId);
      if (!node) {
        throw new Error('当前会话关联的节点不存在。');
      }

      const [nodeMemory, groupMemory] = await Promise.all([
        ctx.capabilities.fileMemory.readNodeMemory(node.id, node.name),
        node.groupId
          ? ctx.capabilities.fileMemory.readGroupMemory(node.groupId, node.groupName)
          : Promise.resolve(null),
      ]);

      return {
        sessionId: args.sessionId,
        node: {
          id: node.id,
          name: node.name,
        },
        nodeMemory,
        groupMemory,
      };
    },
  };

  const readNodeMemoryTool: ToolHandler<typeof nodeMemorySchema> = {
    definition: {
      name: 'memory.read_node_memory',
      description: '读取指定节点的 Markdown 记忆文档。',
      parameters: nodeMemorySchema,
      category: 'system',
      riskLevel: 'safe',
      concurrencyMode: 'parallel-safe',
      version: '1.0.0',
      tags: ['memory', 'node', 'readonly'],
    },
    async execute(args, ctx) {
      const node = resolveNodeFromScope(args.nodeId, ctx, dependencies.getNodeById);
      if (!node) {
        throw new Error('节点不存在。');
      }

      return ctx.capabilities.fileMemory.readNodeMemory(node.id, node.name);
    },
  };

  const readGroupMemoryTool: ToolHandler<typeof groupMemorySchema> = {
    definition: {
      name: 'memory.read_group_memory',
      description: '读取指定分组的 Markdown 记忆文档。',
      parameters: groupMemorySchema,
      category: 'system',
      riskLevel: 'safe',
      concurrencyMode: 'parallel-safe',
      version: '1.0.0',
      tags: ['memory', 'group', 'readonly'],
    },
    async execute(args, ctx) {
      const group = dependencies.getGroupById(args.groupId);
      if (!group) {
        throw new Error('分组不存在。');
      }

      return ctx.capabilities.fileMemory.readGroupMemory(group.id, group.name);
    },
  };

  const writeNodeMemoryTool: ToolHandler<
    typeof writeNodeMemorySchema,
    Static<typeof writeNodeMemorySchema>
  > = {
    definition: {
      name: 'memory.write_node_memory',
      description:
        '将稳定、长期有效的节点知识写入节点记忆文档。不要写入瞬时状态或一次性输出。',
      parameters: writeNodeMemorySchema,
      category: 'system',
      riskLevel: 'safe',
      concurrencyMode: 'serial',
      version: '1.0.0',
      tags: ['memory', 'node', 'write'],
    },
    async execute(args, ctx) {
      const node = resolveNodeFromScope(args.nodeId, ctx, dependencies.getNodeById);
      if (!node) {
        throw new Error('节点不存在。');
      }

      return (args.mode ?? 'append') === 'replace'
        ? ctx.capabilities.fileMemory.writeNodeMemory(node.id, node.name, args.content)
        : ctx.capabilities.fileMemory.appendNodeMemory(node.id, node.name, args.content);
    },
  };

  const writeGroupMemoryTool: ToolHandler<
    typeof writeGroupMemorySchema,
    Static<typeof writeGroupMemorySchema>
  > = {
    definition: {
      name: 'memory.write_group_memory',
      description:
        '将稳定、长期有效的分组知识写入分组记忆文档。不要写入一次性结果。',
      parameters: writeGroupMemorySchema,
      category: 'system',
      riskLevel: 'safe',
      concurrencyMode: 'serial',
      version: '1.0.0',
      tags: ['memory', 'group', 'write'],
    },
    async execute(args, ctx) {
      const group = dependencies.getGroupById(args.groupId);
      if (!group) {
        throw new Error('分组不存在。');
      }

      return (args.mode ?? 'append') === 'replace'
        ? ctx.capabilities.fileMemory.writeGroupMemory(group.id, group.name, args.content)
        : ctx.capabilities.fileMemory.appendGroupMemory(group.id, group.name, args.content);
    },
  };

  return {
    id: 'builtin-file-memory-tools',
    version: '1.0.0',
    register(registry) {
      registry.register(readSessionContextMemoryTool);
      registry.register(readNodeMemoryTool);
      registry.register(readGroupMemoryTool);
      registry.register(writeNodeMemoryTool);
      registry.register(writeGroupMemoryTool);
    },
  };
}
