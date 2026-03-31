# Script Library Design

## Goal

为 OpsClaw 增加一套面向当前 SSH 会话的脚本库能力，让用户可以维护“全局脚本”和“节点覆盖脚本”，并将脚本直接执行到当前激活会话。脚本既支持纯文本命令块，也支持带变量占位的模板脚本。

## Scope

本次设计只覆盖脚本库的首版能力：

- 脚本存储与管理
- 全局脚本和节点脚本两层作用域
- 节点脚本覆盖全局脚本
- 纯文本脚本执行
- 模板脚本变量填写后执行
- 在当前激活 SSH 会话中直接执行

本次不包含：

- 多会话批量执行
- 脚本审批流
- 脚本版本历史
- 条件语句、循环、复杂 DSL
- 服务端沙盒

后续安全能力统一接入沙盒体系，本次默认直接执行。

## Product Shape

用户在工作台中打开脚本库面板后，可以浏览当前可用脚本、搜索脚本、按作用域区分脚本来源、查看脚本详情、编辑脚本、删除脚本，并将脚本直接发送到当前激活终端。

脚本分为两类：

1. `plain`
   纯文本脚本，点击执行后直接将完整内容发送到当前会话。

2. `template`
   模板脚本，脚本内容中允许使用 `${variable}` 占位。执行前展示变量表单，用户填写后将模板渲染为最终命令文本，再发送到当前会话。

## Data Model

脚本库独立于命令历史，不复用 `command_history`。

建议新增脚本实体 `ScriptLibraryItem`：

- `id: string`
- `key: string`
- `scope: 'global' | 'node'`
- `nodeId: string | null`
- `title: string`
- `description: string`
- `kind: 'plain' | 'template'`
- `content: string`
- `variables: ScriptVariableDefinition[]`
- `tags: string[]`
- `createdAt: string`
- `updatedAt: string`

变量定义 `ScriptVariableDefinition`：

- `name: string`
- `label: string`
- `inputType: 'text' | 'textarea'`
- `required: boolean`
- `defaultValue: string`
- `placeholder: string`

关键约束：

- `key` 是稳定业务键，用于节点覆盖全局脚本
- `scope='global'` 时 `nodeId=null`
- `scope='node'` 时 `nodeId` 必填
- `kind='plain'` 时 `variables` 必须为空数组
- `kind='template'` 时允许使用 `${name}` 占位

## Scope Resolution

当前激活会话若绑定了节点，则脚本解析顺序如下：

1. 读取全局脚本
2. 读取当前节点脚本
3. 以 `key` 为准做覆盖合并
4. 若同一 `key` 同时存在全局与节点脚本，保留节点脚本

如果当前会话没有节点，则只展示全局脚本。

建议接口直接返回“已合并的可见脚本列表”，避免前端重复实现覆盖规则。为便于 UI 展示，返回项中仍需包含：

- `scope`
- `nodeId`
- `resolvedFrom: 'global' | 'node'`
- `overridesGlobal: boolean`

## Execution Model

脚本执行不新增新协议，直接复用现有终端发送链路。

执行流程：

1. 用户选中当前激活会话
2. 用户在脚本库中选择脚本
3. 若为 `plain`，直接使用 `content`
4. 若为 `template`，先根据变量定义展示表单
5. 使用表单值渲染 `${variable}` 占位
6. 生成最终命令文本
7. 通过现有 `TerminalWorkspace` -> `SshTerminalPane` 的发送接口下发到当前会话
8. 输出、错误和 transcript 继续走终端现有机制

本次默认直接执行，不增加确认弹窗。

## Template Rules

首版模板语法只支持简单字符串替换：

- 合法占位：`${service}`
- 不支持表达式：`${service || "nginx"}` 不允许
- 不支持循环、判断和嵌套对象路径

校验规则：

- 所有变量定义必须有唯一 `name`
- 模板中的 `${name}` 必须能在 `variables` 中找到
- `variables` 中定义但模板未使用的变量，保存时提示清理
- `required=true` 的变量在执行前必须有值

渲染规则：

- 纯字符串替换，不做 shell 转义魔法
- 保持用户输入原样
- 后续沙盒和执行策略统一处理风险

## UI Design

首版将脚本库放在工作台能力区，作为独立面板，不塞入命令历史弹窗。

建议新增以下 UI 模块：

- `ScriptLibraryPanel`
- `ScriptLibraryList`
- `ScriptLibraryDetail`
- `ScriptEditorDialog`
- `ScriptVariableForm`

脚本库面板结构：

1. 顶部工具栏
   - 搜索框
   - “新增脚本”按钮
   - 当前作用域说明

2. 列表区域
   - 展示当前节点可见脚本
   - 每条显示标题、描述、标签、作用域标记
   - 若脚本来自节点覆盖，显示“节点覆盖”标识

3. 详情区域
   - 标题、描述、标签
   - 原始脚本内容
   - 若为模板脚本，展示变量输入表单
   - 显示执行目标：当前会话标签
   - 主按钮：执行到当前会话

编辑能力：

- 新建时选择作用域：全局 / 当前节点
- 输入 `key`
- 输入标题、描述、标签
- 选择脚本类型：纯文本 / 模板
- 编辑脚本内容
- 若为模板脚本，维护变量列表

## Frontend Architecture

前端建议新增模块：

- `scriptApi.ts`
  负责脚本库 HTTP 请求

- `scriptLibraryModel.ts`
  负责纯函数逻辑：
  - 占位符提取
  - 变量定义校验
  - 模板渲染
  - 列表排序和过滤

- `useScriptLibrary.ts`
  负责加载、刷新、保存、删除、执行状态

- `ScriptLibraryPanel.tsx`
  负责脚本库主界面编排

执行接入：

- 从脚本库获取当前激活会话 ID
- 复用现有 `sendCommandToActive` 或等效终端发送能力
- 脚本库不关心终端输出解析

## Backend Architecture

服务端建议新增：

- `scriptLibraryStore.ts`
  - `listResolvedScripts(nodeId?: string)`
  - `createScript(input)`
  - `updateScript(id, input)`
  - `deleteScript(id)`

- `http/scriptRoutes.ts`
  - `GET /api/scripts`
  - `POST /api/scripts`
  - `PUT /api/scripts/:id`
  - `DELETE /api/scripts/:id`

数据库建议新增独立表，例如 `script_library`：

- `id TEXT PRIMARY KEY`
- `key TEXT NOT NULL`
- `scope TEXT NOT NULL`
- `node_id TEXT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `kind TEXT NOT NULL`
- `content TEXT NOT NULL`
- `variables_json TEXT NOT NULL`
- `tags_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

建议增加唯一性约束：

- `(scope, node_id, key)` 唯一

这样全局层和节点层都能以 `key` 稳定管理脚本。

## Error Handling

需要处理的错误：

1. 保存时校验失败
   - `key` 为空
   - 占位符与变量定义不一致
   - 同作用域下 `key` 冲突

2. 执行前校验失败
   - 当前没有激活会话
   - 模板变量缺失
   - 当前节点脚本被删除后列表未刷新

3. 接口失败
   - 加载失败
   - 保存失败
   - 删除失败

表现形式：

- 表单内联错误优先
- 面板顶部展示轻量错误提示
- 执行失败仍沿用现有终端/状态反馈

## Testing Strategy

建议优先用纯 model/store 测试锁行为，再接 UI：

1. 服务端 store 测试
   - 创建全局脚本
   - 创建节点脚本
   - 节点覆盖全局解析正确
   - 更新和删除正确

2. 前端 model 测试
   - 提取模板变量
   - 校验变量定义
   - 模板渲染
   - 列表过滤和作用域文案

3. 前端 hook / 组件验证
   - 执行前无激活会话时禁用
   - 模板变量必填校验
   - 执行按钮生成的最终命令正确

## Delivery Order

建议实施顺序：

1. 服务端数据表与 store
2. HTTP 路由与测试
3. 前端 API 与 model
4. 脚本库列表和详情面板
5. 模板变量表单
6. 当前会话执行接入
7. 新建、编辑、删除

## Open Follow-Ups

本设计为后续能力预留边界，但不在本次实现：

- 沙盒执行
- 脚本审批
- 批量分发执行
- 脚本版本历史
- Agent 直接调用脚本库
