import { StringEnum, Type, type Static } from '@mariozechner/pi-ai';

import type { ToolHandler, ToolProvider } from '../toolTypes.js';

const interactionOptionSchema = Type.Object({
  label: Type.String({ minLength: 1, description: '选项标签' }),
  value: Type.String({ minLength: 1, description: '选项值' }),
  description: Type.Optional(Type.String({ description: '选项补充说明' })),
});

const interactionFieldSchema = Type.Object({
  type: StringEnum(
    ['display', 'text', 'password', 'textarea', 'single_select', 'multi_select', 'confirm'],
    { description: '字段类型' }
  ),
  key: Type.String({ minLength: 1, description: '字段唯一标识' }),
  label: Type.Optional(Type.String({ description: '字段标题' })),
  required: Type.Optional(Type.Boolean({ description: '是否必填' })),
  value: Type.Optional(Type.String({ description: '文本类默认值' })),
  values: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: '多选默认值',
    })
  ),
  checked: Type.Optional(Type.Boolean({ description: '确认框默认值' })),
  placeholder: Type.Optional(Type.String({ description: '输入占位提示' })),
  options: Type.Optional(
    Type.Array(interactionOptionSchema, {
      description: '单选或多选可选项',
    })
  ),
});

const interactionRequestArgsSchema = Type.Object({
  kind: StringEnum(['collect_input', 'approval', 'inform'], {
    description: '交互类型。collect_input 用于收集参数，approval 用于执行前确认，inform 用于让用户确认一条信息。',
  }),
  title: Type.String({ minLength: 1, description: '卡片标题' }),
  message: Type.String({ minLength: 1, description: '卡片说明文案' }),
  riskLevel: Type.Optional(
    StringEnum(['none', 'low', 'medium', 'high', 'critical'], {
      description: '风险等级，默认按 kind 自动推断。',
    })
  ),
  blockingMode: Type.Optional(
    StringEnum(['none', 'soft_block', 'hard_block'], {
      description: '阻断级别，默认按 kind 自动推断。',
    })
  ),
  fields: Type.Optional(
    Type.Array(interactionFieldSchema, {
      description: '需要前端渲染的字段列表。',
    })
  ),
  reason: Type.Optional(Type.String({ description: '为何需要用户参与的简短说明' })),
});

type InteractionRequestArgs = Static<typeof interactionRequestArgsSchema>;

const interactionRequestTool: ToolHandler<
  typeof interactionRequestArgsSchema,
  InteractionRequestArgs
> = {
  definition: {
    name: 'interaction.request',
    description:
      '当你需要用户补充参数、做选择、批准执行或确认信息时，调用这个工具发起结构化交互，而不是直接用 assistant 文本提问。',
    parameters: interactionRequestArgsSchema,
    category: 'orchestration',
    riskLevel: 'safe',
    concurrencyMode: 'serial',
    version: '1.0.0',
    tags: ['interaction', 'hitl'],
  },
  async execute(args) {
    return args;
  },
};

export const interactionToolProvider: ToolProvider = {
  id: 'builtin-interaction-tools',
  version: '1.0.0',
  register(registry) {
    registry.register(interactionRequestTool);
  },
};
