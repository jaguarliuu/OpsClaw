import type {
  AgentTaskQuery,
  AgentTaskRecord,
  RegisterAgentTaskInput,
} from './taskTypes.js';

export interface AgentTaskRegistry {
  registerTask(input: RegisterAgentTaskInput): AgentTaskRecord;
  saveTask(task: AgentTaskRecord): AgentTaskRecord;
  getTask(taskId: string): AgentTaskRecord | null;
  listTasks(query?: AgentTaskQuery): AgentTaskRecord[];
  deleteTask(taskId: string): boolean;
}

export function createAgentTaskRegistry(): AgentTaskRegistry {
  const tasks = new Map<string, AgentTaskRecord>();

  function cloneTask<T extends AgentTaskRecord>(task: T): T {
    return structuredClone(task);
  }

  function matchesQuery(task: AgentTaskRecord, query: AgentTaskQuery) {
    if (query.runId !== undefined && task.runId !== query.runId) {
      return false;
    }
    if (query.sessionId !== undefined && task.sessionId !== query.sessionId) {
      return false;
    }
    if (query.kind !== undefined && task.kind !== query.kind) {
      return false;
    }
    if (query.parentTaskId !== undefined && task.parentTaskId !== query.parentTaskId) {
      return false;
    }
    if (query.state !== undefined && task.state !== query.state) {
      return false;
    }

    return true;
  }

  return {
    registerTask(input) {
      if (tasks.has(input.taskId)) {
        throw new Error('指定 agent task 已存在。');
      }

      const now = Date.now();
      const task: AgentTaskRecord = {
        ...input,
        state: 'queued',
        waitingOn: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      };

      tasks.set(task.taskId, cloneTask(task));
      return cloneTask(task);
    },

    saveTask(task) {
      if (!tasks.has(task.taskId)) {
        throw new Error('指定 agent task 不存在。');
      }

      const nextTask = {
        ...task,
        updatedAt: Date.now(),
      };
      tasks.set(task.taskId, cloneTask(nextTask));
      return cloneTask(nextTask);
    },

    getTask(taskId) {
      const task = tasks.get(taskId);
      return task ? cloneTask(task) : null;
    },

    listTasks(query = {}) {
      return Array.from(tasks.values())
        .filter((task) => matchesQuery(task, query))
        .map((task) => cloneTask(task));
    },

    deleteTask(taskId) {
      return tasks.delete(taskId);
    },
  };
}
