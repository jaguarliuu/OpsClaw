# OpsClaw 节点状态 Dashboard 设计

> 日期：2026-04-09
> 状态：已确认设计，待进入 implementation planning

## 1. 背景

OpsClaw 当前已经具备：

- 节点连接与 SSH 会话能力
- 脚本库能力，支持全局脚本、节点脚本、模板变量与 `x alias` 快捷执行
- 节点基础信息、系统信息探测与工作台 UI 基础设施

但当前仍缺少一个“面向单节点运行状态”的产品能力：

- 用户无法快速查看某台节点最近一次系统状态
- 也没有可复用的巡检快照存储
- 更没有一个可以逐步演进到“用户自定义采集 + LLM 驱动 dashboard”的稳定数据基础

用户希望新增“节点状态 dashboard”功能，满足如下方向：

1. 每个节点具备巡检采集能力
2. 巡检结果以快照形式存储，并限制保留数量
3. 巡检脚本支持用户自定义
4. 默认 dashboard 使用固定渲染逻辑
5. 后续可以进一步接入 LLM，根据自定义脚本输出生成动态前端渲染 JSON

## 2. 本轮范围

本次设计只落地 `P1 / C` 范围，即先做“手动采集 + 固定 dashboard + 快照存储基础设施”。

### 2.1 本轮目标

- 为每个节点建立一个默认巡检配置
- 打通“执行巡检脚本 -> 输出标准 JSON -> 存储快照 -> 渲染 dashboard”完整链路
- 每个节点只保留最新 10 条快照
- 默认 dashboard 展示固定模块：
  - 系统概览
  - CPU
  - 内存
  - 磁盘
  - 网络
  - 负载
  - Top 进程
- 巡检脚本复用当前脚本库能力
- 用户可以修改节点绑定的巡检脚本内容
- 提供统一“节点状态”模态框，并支持多个入口打开

### 2.2 本轮非目标

本轮明确不做：

- 自动调度 / cron / 定时采集
- LLM 动态 dashboard JSON 协议
- 多套 dashboard 模板切换
- 趋势图与历史分析
- Docker / service 状态模块
- 巡检任务中心
- 巡检权限编排或审批流
- 跨节点聚合视图

## 3. 设计原则

### 3.1 数据链路先稳定，再做智能化

本轮优先建立稳定的数据与渲染边界：

- 脚本如何输出
- 后端如何校验与存储
- 前端如何稳定渲染默认 dashboard

只有这些边界稳定，后续自动调度和 LLM 动态 dashboard 才不会推翻现有实现。

### 3.2 复用现有脚本库能力，但不混淆语义

巡检脚本复用当前脚本存储与编辑能力，但不能和普通 `x alias` 快捷脚本混在一个用户心智中：

- 快捷脚本服务“执行动作”
- 巡检脚本服务“采集状态”

两者底层复用脚本模型，上层交互与用途必须区分。

### 3.3 默认输出统一为标准 JSON

默认巡检脚本以及用户自定义巡检脚本，都要求最终 `stdout` 输出合法 JSON。

原因：

- 快照存储可以统一
- 默认 dashboard 可以稳定读取
- 后续 LLM 生成动态 dashboard 时，可以直接使用 `rawJson`

### 3.4 失败不能破坏最近一次成功快照

节点状态是一类“读为主”的运维信息。即使本次采集失败，也不应让整个 dashboard 变成空白页。

因此：

- 最新一次成功快照仍可继续显示
- 新一次失败采集作为错误状态单独记录
- 用户可以手动重试

## 4. 产品交互设计

## 4.1 统一入口：节点状态模态框

本轮统一提供“节点状态”模态框，所有入口都打开同一个 UI。

入口包括：

- 节点列表右键菜单：`节点状态`
- 终端快捷入口：`x dashboard`
- 全局快捷键：打开当前活动节点的节点状态模态框

### 4.1.1 节点列表右键

在节点列表对节点右键时，增加一项：

- `节点状态`

点击后，打开该节点对应的 dashboard 模态框。

### 4.1.2 `x dashboard`

`x dashboard` 是一个特殊 UI 入口，不是普通脚本执行。

行为定义：

- 当当前活动 session 存在且有 `nodeId` 时
- 用户输入 `x dashboard`
- 系统直接打开当前节点的 dashboard 模态框
- 不向远端 shell 注入任何命令

这条规则优先于普通 `x alias` 脚本解析，以避免和脚本库 alias 机制冲突。

### 4.1.3 快捷键

全局快捷键用于打开“当前活动 session 对应节点”的 dashboard 模态框。

如果当前没有活动 session，则不执行打开动作。

## 4.2 打开模态框后的默认行为

打开节点状态模态框时：

1. 先读取该节点最新一条快照
2. 如果已有快照：
   - 立即渲染默认 dashboard
   - 展示最近采集时间
   - 提供“立即刷新”按钮
3. 如果没有快照：
   - 自动触发一次手动采集
   - 成功后渲染
   - 失败则展示错误态与“重试”按钮

本轮不做打开后自动轮询刷新。

## 4.3 模态框内容结构

节点状态模态框建议采用三段式：

1. 头部
   - 节点名称
   - Host / 用户名 / 最近采集时间
   - “立即刷新”
   - “编辑巡检脚本”

2. 状态摘要区
   - 关键摘要卡片
   - 如 CPU、内存、磁盘、负载等快速概览

3. 详细模块区
   - 系统概览
   - CPU
   - 内存
   - 磁盘
   - 网络
   - 负载
   - Top 进程

底部可展示最近 10 次快照列表的轻量摘要，但本轮不展开历史对比。

## 5. 默认巡检 JSON 合约

默认巡检脚本必须输出一个顶层标准 JSON 对象。

建议结构如下：

```json
{
  "schemaVersion": 1,
  "collectedAt": "2026-04-09T18:30:00.000Z",
  "system": {
    "hostname": "prod-a",
    "os": "ubuntu",
    "osVersion": "22.04",
    "kernel": "5.15.0-xx",
    "arch": "x86_64",
    "uptimeSeconds": 123456
  },
  "cpu": {
    "cores": 4,
    "usagePercent": 37.2,
    "load1": 0.81,
    "load5": 0.64,
    "load15": 0.59
  },
  "memory": {
    "totalBytes": 17179869184,
    "usedBytes": 8589934592,
    "availableBytes": 7516192768,
    "usagePercent": 50.0
  },
  "disk": {
    "filesystems": [
      {
        "mount": "/",
        "totalBytes": 107374182400,
        "usedBytes": 42949672960,
        "availableBytes": 64424509440,
        "usagePercent": 40.0
      }
    ]
  },
  "network": {
    "interfaces": [
      {
        "name": "eth0",
        "rxBytes": 123456789,
        "txBytes": 987654321
      }
    ]
  },
  "topProcesses": [
    {
      "pid": 1234,
      "name": "python",
      "cpuPercent": 18.3,
      "memoryPercent": 6.1
    }
  ]
}
```

### 5.1 字段要求

- `schemaVersion`：必填，v1 固定为 `1`
- `collectedAt`：建议由脚本输出；若脚本未输出，后端可补齐
- 各模块允许部分字段缺失
- 缺失字段不导致整次快照失败

### 5.2 兼容原则

为保证在 Ubuntu / Debian / CentOS 等常见 Linux 节点上运行稳定：

- 默认巡检脚本优先使用 shell + 常见系统命令
- 不依赖 Python / Node 等额外运行时
- 某个命令不可用时，对应字段返回 `null` 或空数组
- 不因为单项采集失败导致整个 JSON 构造失败

## 6. 脚本模型复用方案

本轮复用现有脚本库能力，但增加“用途语义层”。

建议在现有脚本模型上新增：

```ts
type ScriptUsage = 'quick_run' | 'inspection';
```

### 6.1 各用途行为

- `quick_run`
  - 现有普通脚本
  - 进入脚本库常规列表
  - 出现在 `x alias` 候选中

- `inspection`
  - 节点巡检脚本
  - 不进入 `x alias` 候选
  - 通过 dashboard 模态框中的“编辑巡检脚本”入口管理
  - 仍复用现有脚本编辑器

### 6.2 默认节点巡检脚本

节点创建成功后，系统自动生成一份 node-scope 的默认巡检脚本：

- `scope = node`
- `scriptUsage = inspection`
- `kind = plain`
- `nodeId = 当前节点 id`
- 内容为默认系统巡检 shell 脚本

同时为该节点创建对应的 inspection profile，并自动绑定此脚本。

### 6.3 用户自定义

用户可以修改节点绑定的 inspection 脚本内容，但本轮仍要求最终输出标准 JSON。

本轮先不支持：

- 一节点多巡检脚本
- 巡检脚本模板变量注入
- 巡检脚本多版本管理

## 7. 后端模型设计

## 7.1 `node_inspection_profile`

每个节点一条记录，表示该节点当前状态采集配置。

建议字段：

```ts
type NodeInspectionProfile = {
  id: string;
  nodeId: string;
  scriptId: string;
  outputFormat: 'json';
  dashboardMode: 'default_system';
  scriptSource: 'system_default' | 'user_customized';
  createdAt: string;
  updatedAt: string;
};
```

职责：

- 指定节点当前使用哪份巡检脚本
- 指定当前 dashboard 模式
- 作为后续自动调度和动态 dashboard 的稳定配置入口

## 7.2 `node_inspection_snapshot`

每次采集生成一条快照。

建议字段：

```ts
type NodeInspectionSnapshot = {
  id: string;
  nodeId: string;
  scriptId: string;
  status: 'success' | 'error';
  collectedAt: string;
  rawJson: string | null;
  normalizedSummaryJson: string | null;
  errorMessage: string | null;
  createdAt: string;
};
```

说明：

- `rawJson`：存原始 JSON 输出，后续给 LLM 生成动态 dashboard 用
- `normalizedSummaryJson`：只提取默认 dashboard 需要的稳定字段
- `status=error` 时，`rawJson` / `normalizedSummaryJson` 可以为空，`errorMessage` 记录失败原因

### 7.2.1 保留策略

每次为某节点写入新 snapshot 后：

- 保留该节点最新 10 条
- 超出 10 条的旧记录立即删除

本轮不做归档。

## 8. 后端执行流程

## 8.1 手动采集

新增接口：

- `POST /api/nodes/:id/dashboard/collect`

行为：

1. 读取节点 inspection profile
2. 找到关联的 inspection 脚本
3. 使用现有 SSH 执行能力，在目标节点执行脚本
4. 获取 `stdout`
5. 校验是否为合法 JSON
6. 标准化提取默认 dashboard 所需字段
7. 写入 snapshot
8. 对该节点执行“只保留最新 10 条”
9. 返回最新 snapshot 数据

## 8.2 读取 dashboard 数据

新增接口：

- `GET /api/nodes/:id/dashboard`

返回：

- inspection profile
- latest snapshot
- 最近 10 条 snapshot 的轻量摘要列表
- `dashboardSchemaKey = "default_system"`

本轮前端按固定 `dashboardSchemaKey` 走内置默认渲染器。

## 9. 前端实现边界

## 9.1 默认 dashboard 是固定渲染器，不是动态 JSON

本轮前端直接内置 `default_system` dashboard 渲染器：

- 输入：`normalizedSummaryJson`
- 输出：固定布局的状态卡片与模块区

不引入动态前端 DSL，也不引入 LLM 生成的渲染协议。

## 9.2 模态框中的“编辑巡检脚本”

“编辑巡检脚本”入口不创建新的编辑器，而是复用现有脚本编辑能力。

建议行为：

- 打开脚本编辑模态框
- 加载当前节点绑定的 inspection 脚本
- 保存后，dashboard 侧重新读取 profile 与最新脚本内容

本轮不强制“修改脚本后立即自动重新采集”，仍由用户点击“立即刷新”触发。

## 9.3 快捷键行为

全局快捷键打开当前活动节点 dashboard：

- 如果存在活动 session 且其含有 `nodeId`，打开对应节点状态模态框
- 否则不执行打开动作

快捷键具体组合可在 implementation planning 阶段对齐现有工作台快捷键体系。

## 10. 错误处理

### 10.1 SSH 不可达

- 本次采集失败
- 写入错误 snapshot
- dashboard 若已有最近成功快照，则继续展示最近成功快照
- 显示错误提示与“重试”按钮

### 10.2 脚本执行超时

- 标记为错误 snapshot
- 不覆盖最近成功快照展示

### 10.3 输出不是合法 JSON

- 标记为脚本错误
- 记录错误 snapshot
- 提示“巡检脚本输出格式无效”
- 引导用户编辑巡检脚本

### 10.4 JSON 缺少部分字段

- `rawJson` 照常存储
- `normalizedSummaryJson` 仅提取可识别字段
- 默认 dashboard 对缺失字段显示 `--`
- 不因为部分字段缺失导致整个 dashboard 失败

## 11. 演进路线

本轮完成后，后续可自然演进为：

### 11.1 下一阶段：自动调度

在 inspection profile 上增加调度配置：

- 采集频率
- 是否启用
- 最近执行时间

并通过后端定时器按 profile 调度采集。

### 11.2 下一阶段：动态 dashboard

在已有 `rawJson` 基础上：

- 将用户脚本输出 schema / 样例快照交给 LLM
- 生成前端可渲染 JSON 协议
- 前端用统一 dashboard renderer 渲染

### 11.3 下一阶段：历史分析

基于快照历史增加：

- 趋势图
- 指标对比
- 异常提示

## 12. 方案总结

本次设计采用“复用脚本库 + 独立 inspection profile + 独立 snapshot + 固定 dashboard renderer”的方案。

它的核心价值是：

- 这轮实现成本可控
- 不需要额外造一套脚本管理系统
- 数据边界清晰
- 后续自动调度与 LLM 动态 dashboard 都可以在现有模型上演进

本轮的完成定义是：

- 节点创建后具备默认巡检脚本与 inspection profile
- 用户可从右键、`x dashboard`、快捷键打开节点状态模态框
- 模态框可读取最近快照，或在无快照时自动采集一次
- 支持手动刷新
- 每节点只保留最新 10 条快照
- 用户可修改巡检脚本，并继续沿用标准 JSON 输出契约
