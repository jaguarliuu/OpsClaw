import { Type, type Static } from '@mariozechner/pi-ai';

import type { ToolHandler, ToolProvider } from '../toolTypes.js';

const sessionRefSchema = Type.Object({
  sessionId: Type.String({ minLength: 1, description: '目标 SSH 会话 ID' }),
});

const listSessionsTool: ToolHandler = {
  definition: {
    name: 'session.list',
    description: '列出当前所有可用的 SSH 会话及其连接状态。',
    parameters: Type.Object({}),
    category: 'session',
    riskLevel: 'safe',
    concurrencyMode: 'parallel-safe',
    version: '1.0.0',
    tags: ['session', 'readonly'],
  },
  execute(_args, ctx) {
    return Promise.resolve({
      sessions: ctx.capabilities.sessions.listSessions(),
    });
  },
};

const getSessionMetadataTool: ToolHandler<typeof sessionRefSchema> = {
  definition: {
    name: 'session.get_metadata',
    description: '读取指定 SSH 会话的基础信息和连接状态。',
    parameters: sessionRefSchema,
    category: 'session',
    riskLevel: 'safe',
    concurrencyMode: 'parallel-safe',
    version: '1.0.0',
    tags: ['session', 'readonly'],
    enabledByDefault: false,
  },
  execute(args, ctx) {
    const session = ctx.capabilities.sessions.getSession(args.sessionId);
    if (!session) {
      throw new Error('指定会话不存在或已断开。');
    }

    return Promise.resolve(session);
  },
};

const readTranscriptArgsSchema = Type.Object({
  sessionId: Type.String({ minLength: 1, description: '目标 SSH 会话 ID' }),
  maxChars: Type.Optional(
    Type.Number({
      minimum: 500,
      maximum: 20000,
      description: '读取的最大字符数，默认读取最近 6000 个字符',
    })
  ),
});

const readTranscriptTool: ToolHandler<typeof readTranscriptArgsSchema> = {
  definition: {
    name: 'session.read_transcript',
    description: '读取指定 SSH 会话最近的终端转录内容，用于补充上下文。',
    parameters: readTranscriptArgsSchema,
    category: 'session',
    riskLevel: 'safe',
    concurrencyMode: 'parallel-safe',
    version: '1.0.0',
    tags: ['session', 'readonly', 'transcript'],
  },
  execute(args, ctx) {
    return Promise.resolve(
      ctx.capabilities.sessions.getTranscript(args.sessionId, args.maxChars ?? 6000)
    );
  },
};

const runCommandArgsSchema = Type.Object({
  sessionId: Type.String({ minLength: 1, description: '目标 SSH 会话 ID' }),
  command: Type.String({ minLength: 1, description: '要在会话中执行的 shell 命令' }),
  timeoutMs: Type.Optional(
    Type.Number({
      minimum: 1000,
      maximum: 120000,
      description: '命令超时时间，单位毫秒',
    })
  ),
  reason: Type.Optional(Type.String({ description: '执行该命令的简短原因说明' })),
});

type RunCommandArgs = Static<typeof runCommandArgsSchema>;

function createSessionRunCommandTool(): ToolHandler<typeof runCommandArgsSchema, RunCommandArgs> {
  return {
    definition: {
      name: 'session.run_command',
      description: '在指定 SSH 会话中执行一条 shell 命令，并返回退出码与输出。',
      parameters: runCommandArgsSchema,
      category: 'session',
      riskLevel: 'caution',
      concurrencyMode: 'session-exclusive',
      version: '1.0.0',
      tags: ['session', 'command'],
    },
    async execute(args, ctx) {
      return ctx.capabilities.sessions.executeCommand(args.sessionId, args.command, {
        timeoutMs: args.timeoutMs,
        maxOutputChars: ctx.maxCommandOutputChars,
        signal: ctx.signal,
      });
    },
  };
}

const runCommandTool = createSessionRunCommandTool();

export const sessionToolProvider: ToolProvider = {
  id: 'builtin-session-tools',
  version: '1.0.0',
  register(registry) {
    registry.register(listSessionsTool);
    registry.register(getSessionMetadataTool);
    registry.register(readTranscriptTool);
    registry.register(runCommandTool);
  },
};
