# OpsClaw Wave 1 Durable State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable session thread, run, gate, and task persistence so OpsClaw can recover agent and chat context after panel close, page refresh, or suspended HITL flow.

**Architecture:** Build a server-side conversation thread store on top of the existing SQLite layer, then connect agent run snapshots, gate snapshots, task snapshots, and chat events into that store through narrow persistence adapters. Finish by exposing recovery and clear APIs and wiring the workbench AI panel to rehydrate per-session thread state.

**Tech Stack:** TypeScript, sql.js, Express SSE, React, node:test, tsx

---

## File Map

### New Files

- `server/conversationThreadStore.ts`
  - Persistent store for session-bound threads and ordered conversation events.
- `server/conversationThreadStore.test.ts`
  - Store-level regression coverage for thread lifecycle, sequence ordering, and recovery queries.
- `server/conversationTypes.ts`
  - Shared server-side thread and event types used by stores and routes.
- `server/http/conversationRoutes.ts`
  - HTTP routes for thread fetch, clear, and manual recovery entry points.
- `src/features/workbench/conversationApi.ts`
  - Frontend API wrappers for thread fetch and clear actions.
- `src/features/workbench/conversationModel.ts`
  - Workbench projection helpers for thread payload to panel state.
- `src/features/workbench/conversationModel.test.ts`
  - Projection tests for mixed chat, agent, terminal, and status events.

### Existing Files To Modify

- `server/database.ts`
- `server/serverApp.ts`
- `server/httpApi.ts`
- `server/http/support.ts`
- `server/http/agentRoutes.ts`
- `server/http/commandRoutes.ts`
- `server/http/llmRoutes.ts`
- `server/agent/agentRunRegistry.ts`
- `server/agent/agentRuntime.ts`
- `server/agent/runtimeBundle.ts`
- `server/agent/taskRegistry.ts`
- `server/agent/taskTypes.ts`
- `src/features/workbench/agentApi.ts`
- `src/features/workbench/llmApi.ts`
- `src/features/workbench/useAgentRun.ts`
- `src/features/workbench/useStreamingChat.ts`
- `src/features/workbench/AiAssistantPanel.tsx`
- `src/routes/WorkbenchPage.tsx`

---

## Task 1: Add Persistent Conversation Thread Storage

**Files:**
- Create: `server/conversationTypes.ts`
- Create: `server/conversationThreadStore.ts`
- Create: `server/conversationThreadStore.test.ts`
- Modify: `server/database.ts`

- [ ] **Step 1: Write the failing store tests**

Add tests that prove:

```ts
void test('getOrCreateActiveThread returns one active thread per session', async () => {
  const store = await createConversationThreadStore();
  const first = store.getOrCreateActiveThread({ sessionId: 'session-1', nodeId: 'node-1' });
  const second = store.getOrCreateActiveThread({ sessionId: 'session-1', nodeId: 'node-1' });
  assert.equal(second.id, first.id);
});

void test('appendEvent increments per-thread sequence monotonically', async () => {
  const store = await createConversationThreadStore();
  const thread = store.getOrCreateActiveThread({ sessionId: 'session-1', nodeId: 'node-1' });
  const first = store.appendEvent(thread.id, { channel: 'chat', eventType: 'user_message', contentText: 'hi' });
  const second = store.appendEvent(thread.id, { channel: 'chat', eventType: 'assistant_message', contentText: 'hello' });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/conversationThreadStore.test.ts
```

Expected:

- FAIL because `conversationThreadStore.ts` and the new tables do not exist yet

- [ ] **Step 3: Implement the SQLite schema and store**

Add new tables in `server/database.ts`:

```sql
CREATE TABLE IF NOT EXISTS conversation_threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  node_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  last_run_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  cleared_at TEXT
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  run_id TEXT,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  step INTEGER,
  sequence INTEGER NOT NULL,
  content_text TEXT,
  content_json TEXT,
  created_at TEXT NOT NULL
);
```

Implement store methods in `server/conversationThreadStore.ts`:

- `getOrCreateActiveThread()`
- `getActiveThreadBySessionId()`
- `appendEvent()`
- `listEvents(threadId)`
- `clearThread(threadId)`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/conversationThreadStore.test.ts
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.server.json
```

Expected:

- all thread-store tests pass
- server typecheck passes

- [ ] **Step 5: Commit**

```bash
git add server/database.ts server/conversationTypes.ts server/conversationThreadStore.ts server/conversationThreadStore.test.ts
git commit -m "feat: add persistent conversation thread store"
```

## Task 2: Persist Agent Run, Gate, And Task Snapshots

**Files:**
- Modify: `server/agent/agentRunRegistry.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/agent/runtimeBundle.ts`
- Modify: `server/agent/taskRegistry.ts`
- Modify: `server/agent/taskTypes.ts`
- Modify: `server/serverApp.ts`
- Create: `server/conversationTypes.ts` (reuse from Task 1)

- [ ] **Step 1: Write the failing persistence integration tests**

Add tests that prove:

```ts
void test('run and gate transitions are mirrored into durable snapshots', async () => {
  // register run -> open gate -> expire gate -> verify persisted snapshot query
});

void test('task registry can save and reload task records by runId and state', async () => {
  // register task -> save running -> save waiting -> query by runId/state
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts
```

Expected:

- FAIL because durable task/run persistence is not wired through the runtime bundle

- [ ] **Step 3: Introduce persistence adapters and wire them**

Implement three narrow persistence responsibilities:

```ts
type AgentRunSnapshotPersistence = {
  saveRunSnapshot: (snapshot: AgentRunRecord) => void;
  getReattachableRun: (sessionId: string) => AgentRunRecord | null;
};

type AgentTaskPersistence = {
  saveTask: (task: AgentTaskRecord) => AgentTaskRecord;
  listTasks: (query?: AgentTaskQuery) => AgentTaskRecord[];
};
```

Wire them so:

- `agentRunRegistry` persists every state transition
- `taskRegistry` persists `queued/running/waiting/completed/failed/cancelled`
- `runtimeBundle` owns store construction
- `serverApp` injects the concrete stores once

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts server/agent/runtimeBundle.test.ts
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.server.json
```

Expected:

- runtime and registry tests pass with durable persistence enabled
- server typecheck passes

- [ ] **Step 5: Commit**

```bash
git add server/agent/agentRunRegistry.ts server/agent/agentRuntime.ts server/agent/runtimeBundle.ts server/agent/taskRegistry.ts server/agent/taskTypes.ts server/serverApp.ts
git commit -m "feat: persist agent runs gates and tasks"
```

## Task 3: Write Thread Events From Agent, Chat, And Manual Commands

**Files:**
- Modify: `server/http/agentRoutes.ts`
- Modify: `server/http/llmRoutes.ts`
- Modify: `server/http/commandRoutes.ts`
- Modify: `server/http/support.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/conversationThreadStore.ts`

- [ ] **Step 1: Write the failing event-write tests**

Add tests that prove:

```ts
void test('agent run_started tool_result and final_answer write ordered thread events', async () => {
  // create run, stream completion, assert event sequence in thread store
});

void test('chat route writes user_message and assistant_message into the active session thread', async () => {
  // POST /api/llm/chat with sessionId and assert thread events
});

void test('manual command route writes terminal manual_command summary when requested', async () => {
  // POST command history or command-execute route and assert terminal event
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/http/agentRoutes.test.ts server/llmRoutes.test.ts server/httpApi.test.ts
```

Expected:

- FAIL because neither agent route nor llm route currently writes thread events

- [ ] **Step 3: Thread session-aware event writes through the server**

Make these API changes:

- `POST /api/llm/chat` accepts `sessionId`
- chat requests append `user_message` and final `assistant_message`
- agent runtime appends durable events for:
  - `user_message`
  - `assistant_message`
  - `tool_call`
  - `tool_result`
  - `final_answer`
  - `status`
  - `human_gate`
- manual terminal command entry writes `manual_command` only for explicit session-bound actions, not raw transcript chunks

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/http/agentRoutes.test.ts server/llmRoutes.test.ts server/httpApi.test.ts
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.server.json
```

Expected:

- route tests pass
- server typecheck passes

- [ ] **Step 5: Commit**

```bash
git add server/http/agentRoutes.ts server/http/llmRoutes.ts server/http/commandRoutes.ts server/http/support.ts server/agent/agentRuntime.ts
git commit -m "feat: write durable session thread events"
```

## Task 4: Add Thread Recovery And Clear APIs

**Files:**
- Create: `server/http/conversationRoutes.ts`
- Modify: `server/httpApi.ts`
- Modify: `server/http/support.ts`
- Create: `src/features/workbench/conversationApi.ts`

- [ ] **Step 1: Write the failing API tests**

Add tests that prove:

```ts
void test('get active session thread returns thread metadata and ordered events', async () => {
  // GET /api/conversations/sessions/:sessionId/thread
});

void test('clear session thread marks current thread cleared and creates a new active thread on next write', async () => {
  // POST /api/conversations/threads/:threadId/clear
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/httpApi.test.ts
```

Expected:

- FAIL because conversation routes do not exist yet

- [ ] **Step 3: Implement fetch and clear endpoints**

Add routes:

```ts
GET /api/conversations/sessions/:sessionId/thread
POST /api/conversations/threads/:threadId/clear
GET /api/conversations/sessions/:sessionId/recovery
```

`recovery` should return one payload that contains:

- active thread metadata
- ordered thread events
- latest reattachable run snapshot if present
- latest waiting or suspended task records for the session

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test server/httpApi.test.ts server/httpRouteModules.test.ts
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.server.json
```

Expected:

- conversation route tests pass
- route module registration stays green

- [ ] **Step 5: Commit**

```bash
git add server/http/conversationRoutes.ts server/httpApi.ts server/http/support.ts src/features/workbench/conversationApi.ts
git commit -m "feat: add conversation recovery and clear APIs"
```

## Task 5: Rehydrate The AI Panel From Durable Session State

**Files:**
- Create: `src/features/workbench/conversationModel.ts`
- Create: `src/features/workbench/conversationModel.test.ts`
- Modify: `src/features/workbench/agentApi.ts`
- Modify: `src/features/workbench/llmApi.ts`
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/useStreamingChat.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`

- [ ] **Step 1: Write the failing frontend recovery tests**

Add tests that prove:

```ts
void test('conversation model reconstructs agent timeline items from persisted events', () => {
  // mixed event list -> timeline items + active gate + recovery metadata
});

void test('conversation model reconstructs chat messages from persisted chat events', () => {
  // user_message + assistant_message -> chat state
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test src/features/workbench/conversationModel.test.ts src/features/workbench/useAgentRunModel.test.ts
```

Expected:

- FAIL because no thread projection or recovery loader exists yet

- [ ] **Step 3: Implement panel recovery**

The workbench should:

- fetch the current session recovery payload when AI panel opens or session changes
- hydrate:
  - chat messages
  - agent timeline items
  - active gate
  - pending continuation run
- clear the current durable thread through the new API instead of only clearing in-memory arrays
- send `sessionId` through chat requests so chat events are written into the same thread

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test src/features/workbench/conversationModel.test.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/aiAssistantPanelModel.test.ts
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

Expected:

- frontend recovery tests pass
- app typecheck passes

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/conversationApi.ts src/features/workbench/conversationModel.ts src/features/workbench/conversationModel.test.ts src/features/workbench/agentApi.ts src/features/workbench/llmApi.ts src/features/workbench/useAgentRun.ts src/features/workbench/useStreamingChat.ts src/features/workbench/AiAssistantPanel.tsx src/routes/WorkbenchPage.tsx
git commit -m "feat: rehydrate ai panel from durable session state"
```

## Final Verification

- [ ] Run:

```bash
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsx --test \
  server/conversationThreadStore.test.ts \
  server/agent/agentRunRegistry.test.ts \
  server/agent/agentRuntime.test.ts \
  server/http/agentRoutes.test.ts \
  server/llmRoutes.test.ts \
  server/httpApi.test.ts \
  src/features/workbench/conversationModel.test.ts \
  src/features/workbench/useAgentRunModel.test.ts

/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.server.json
/Users/eumenides/Desktop/jaguarliu/core/opsclaw/node_modules/.bin/tsc --noEmit -p tsconfig.app.json
git diff --check
```

- [ ] Commit the final integration polish:

```bash
git add server/database.ts server/conversationThreadStore.ts server/http/conversationRoutes.ts src/features/workbench/conversationApi.ts src/features/workbench/conversationModel.ts
git commit -m "feat: complete wave1 durable state foundation"
```

