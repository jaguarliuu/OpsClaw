import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionCard } from '@/components/ui/SectionCard';
import { Textarea } from '@/components/ui/textarea';
import { createScript, deleteScript, fetchScripts, updateScript } from '@/features/workbench/scriptApi';
import {
  buildScriptVariableInitialValues,
  extractTemplateVariableNames,
  filterScriptLibraryItems,
  renderScriptTemplate,
  validateScriptAlias,
  validateScriptVariableValues,
} from '@/features/workbench/scriptLibraryModel';
import type {
  ScriptLibraryItem,
  ScriptLibraryUpsertInput,
  ScriptScope,
  ScriptVariableDefinition,
} from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type ScriptLibraryPanelProps = {
  activeNodeId: string | null;
  activeSessionId: string | null;
  activeSessionLabel: string | null;
  onClose: () => void;
  onExecuteCommand: (command: string) => void;
};

type EditorState = {
  open: boolean;
  mode: 'create' | 'edit';
  itemId: string | null;
  draft: ScriptLibraryUpsertInput;
  tagsText: string;
};

const EMPTY_VARIABLE: ScriptVariableDefinition = {
  name: '',
  label: '',
  inputType: 'text',
  required: false,
  defaultValue: '',
  placeholder: '',
};

function createEmptyScriptDraft(activeNodeId: string | null): ScriptLibraryUpsertInput {
  return {
    key: '',
    alias: '',
    scope: activeNodeId ? 'node' : 'global',
    nodeId: activeNodeId,
    title: '',
    description: '',
    kind: 'plain',
    content: '',
    variables: [],
    tags: [],
  };
}

function createEditorState(activeNodeId: string | null): EditorState {
  return {
    open: false,
    mode: 'create',
    itemId: null,
    draft: createEmptyScriptDraft(activeNodeId),
    tagsText: '',
  };
}

function buildEditorStateFromItem(item: ScriptLibraryItem): EditorState {
  return {
    open: true,
    mode: 'edit',
    itemId: item.id,
    draft: {
      key: item.key,
      alias: item.alias,
      scope: item.scope,
      nodeId: item.nodeId,
      title: item.title,
      description: item.description,
      kind: item.kind,
      content: item.content,
      variables: item.variables,
      tags: item.tags,
    },
    tagsText: item.tags.join(', '),
  };
}

function parseTags(value: string) {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildUpsertInput(editorState: EditorState): ScriptLibraryUpsertInput {
  return {
    key: editorState.draft.key.trim(),
    alias: editorState.draft.alias.trim(),
    scope: editorState.draft.scope,
    nodeId: editorState.draft.scope === 'node' ? editorState.draft.nodeId : null,
    title: editorState.draft.title.trim(),
    description: editorState.draft.description.trim(),
    kind: editorState.draft.kind,
    content: editorState.draft.content,
    variables: editorState.draft.variables,
    tags: parseTags(editorState.tagsText),
  };
}

function getScriptScopeLabel(item: Pick<ScriptLibraryItem, 'resolvedFrom' | 'scope' | 'overridesGlobal'>) {
  if (item.scope === 'node') {
    return item.overridesGlobal ? '节点覆盖' : '节点脚本';
  }

  return item.resolvedFrom === 'global' ? '全局脚本' : '节点解析';
}

function ScriptLibraryEditorDialog({
  activeNodeId,
  errorMessage,
  isSaving,
  onClose,
  onSave,
  onStateChange,
  state,
}: {
  activeNodeId: string | null;
  errorMessage: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onStateChange: (updater: (current: EditorState) => EditorState) => void;
  state: EditorState;
}) {
  const usedVariables = extractTemplateVariableNames(state.draft.content);

  return (
    <Dialog open={state.open} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.mode === 'create' ? '新建脚本' : '编辑脚本'}</DialogTitle>
          <DialogDescription>
            支持全局脚本和当前节点脚本。模板脚本使用 `${'{name}'}` 占位。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor="script-scope">作用域</Label>
            <Select
              onValueChange={(value: ScriptScope) => {
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    scope: value,
                  },
                }));
              }}
              value={state.draft.scope}
            >
              <SelectTrigger id="script-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">全局脚本</SelectItem>
                {activeNodeId ? <SelectItem value="node">当前节点覆盖</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="script-key">脚本 Key</Label>
              <Input
                id="script-key"
                onChange={(event) => {
                  const value = event.target.value;
                  onStateChange((current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      key: value,
                    },
                  }));
                }}
                placeholder="restart-nginx"
                value={state.draft.key}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="script-alias">脚本别名</Label>
              <Input
                id="script-alias"
                value={state.draft.alias}
                onChange={(event) =>
                  onStateChange((current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      alias: event.target.value,
                    },
                  }))
                }
                placeholder="例如 nginx-restart"
              />
              <p className="text-xs text-neutral-500">终端中输入 x {state.draft.alias || '<alias>'} 可快捷执行。</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="script-title">标题</Label>
            <Input
              id="script-title"
              onChange={(event) => {
                const value = event.target.value;
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    title: value,
                  },
                }));
              }}
              placeholder="重启 Nginx"
              value={state.draft.title}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="script-description">描述</Label>
            <Input
              id="script-description"
              onChange={(event) => {
                const value = event.target.value;
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    description: value,
                  },
                }));
              }}
              placeholder="用途、注意事项、执行场景"
              value={state.draft.description}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="script-tags">标签</Label>
            <Input
              id="script-tags"
              onChange={(event) => {
                const value = event.target.value;
                onStateChange((current) => ({
                  ...current,
                  tagsText: value,
                }));
              }}
              placeholder="ops, web, inspect"
              value={state.tagsText}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="script-kind">类型</Label>
            <Select
              onValueChange={(value: 'plain' | 'template') => {
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    kind: value,
                    variables: value === 'template' ? current.draft.variables : [],
                  },
                }));
              }}
              value={state.draft.kind}
            >
              <SelectTrigger id="script-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">纯文本脚本</SelectItem>
                <SelectItem value="template">模板脚本</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="script-content">脚本内容</Label>
            <Textarea
              id="script-content"
              onChange={(event) => {
                const value = event.target.value;
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    content: value,
                  },
                }));
              }}
              placeholder="sudo systemctl restart nginx"
              value={state.draft.content}
            />
            {state.draft.kind === 'template' ? (
              <p className="text-xs text-neutral-400">
                当前识别到的占位符: {usedVariables.length > 0 ? usedVariables.join(', ') : '无'}
              </p>
            ) : null}
          </div>

          {state.draft.kind === 'template' ? (
            <div className="grid gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-neutral-100">模板变量</h3>
                  <p className="text-xs text-neutral-400">
                    变量名要与 `${'{name}'}` 占位一致。
                  </p>
                </div>
                <Button
                  onClick={() => {
                    onStateChange((current) => ({
                      ...current,
                      draft: {
                        ...current.draft,
                        variables: [...current.draft.variables, EMPTY_VARIABLE],
                      },
                    }));
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  新增变量
                </Button>
              </div>

              {state.draft.variables.length > 0 ? (
                <div className="grid gap-3">
                  {state.draft.variables.map((variable, index) => (
                    <div className="grid gap-3 rounded-md border border-neutral-800/80 bg-neutral-900/60 p-3" key={`${variable.name || 'var'}-${index}`}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>变量名</Label>
                          <Input
                            onChange={(event) => {
                              const value = event.target.value;
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, name: value } : item
                                  ),
                                },
                              }));
                            }}
                            placeholder="service"
                            value={variable.name}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>显示名</Label>
                          <Input
                            onChange={(event) => {
                              const value = event.target.value;
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, label: value } : item
                                  ),
                                },
                              }));
                            }}
                            placeholder="服务名"
                            value={variable.label}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="grid gap-2">
                          <Label>输入类型</Label>
                          <Select
                            onValueChange={(value: 'text' | 'textarea') => {
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, inputType: value } : item
                                  ),
                                },
                              }));
                            }}
                            value={variable.inputType}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">单行</SelectItem>
                              <SelectItem value="textarea">多行</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label>默认值</Label>
                          <Input
                            onChange={(event) => {
                              const value = event.target.value;
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, defaultValue: value } : item
                                  ),
                                },
                              }));
                            }}
                            value={variable.defaultValue}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>占位提示</Label>
                          <Input
                            onChange={(event) => {
                              const value = event.target.value;
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, placeholder: value } : item
                                  ),
                                },
                              }));
                            }}
                            value={variable.placeholder}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-neutral-300">
                          <input
                            checked={variable.required}
                            className="h-4 w-4 rounded border border-neutral-700 bg-neutral-800"
                            onChange={(event) => {
                              const checked = event.target.checked;
                              onStateChange((current) => ({
                                ...current,
                                draft: {
                                  ...current.draft,
                                  variables: current.draft.variables.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, required: checked } : item
                                  ),
                                },
                              }));
                            }}
                            type="checkbox"
                          />
                          必填
                        </label>

                        <Button
                          onClick={() => {
                            onStateChange((current) => ({
                              ...current,
                              draft: {
                                ...current.draft,
                                variables: current.draft.variables.filter((_item, itemIndex) => itemIndex !== index),
                              },
                            }));
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          删除变量
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-400">
                  当前还没有变量定义。
                </div>
              )}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            取消
          </Button>
          <Button disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? '保存中...' : '保存脚本'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScriptLibraryPanel({
  activeNodeId,
  activeSessionId,
  activeSessionLabel,
  onClose,
  onExecuteCommand,
}: ScriptLibraryPanelProps) {
  const [items, setItems] = useState<ScriptLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(() => createEditorState(activeNodeId));
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextItems = await fetchScripts(activeNodeId);
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setItems(nextItems);
          setSelectedScriptId((current) =>
            current && nextItems.some((item) => item.id === current)
              ? current
              : nextItems[0]?.id ?? null
          );
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : '脚本列表加载失败。');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeNodeId]);

  const filteredItems = filterScriptLibraryItems(items, deferredQuery);
  const selectedScript =
    filteredItems.find((item) => item.id === selectedScriptId) ??
    filteredItems[0] ??
    null;

  useEffect(() => {
    if (!selectedScript) {
      setVariableValues({});
      return;
    }

    setVariableValues(buildScriptVariableInitialValues(selectedScript.variables));
    if (selectedScriptId !== selectedScript.id) {
      setSelectedScriptId(selectedScript.id);
    }
  }, [selectedScript, selectedScriptId]);

  async function reloadScripts(nextSelectedId?: string | null) {
    const nextItems = await fetchScripts(activeNodeId);
    startTransition(() => {
      setItems(nextItems);
      setSelectedScriptId(
        nextSelectedId && nextItems.some((item) => item.id === nextSelectedId)
          ? nextSelectedId
          : nextItems[0]?.id ?? null
      );
    });
  }

  async function handleSaveScript() {
    setEditorError(null);
    setIsSaving(true);

    try {
      const payload = buildUpsertInput(editorState);
      const aliasValidation = validateScriptAlias(payload.alias);
      if (!aliasValidation.ok) {
        setEditorError(aliasValidation.message);
        return;
      }

      let nextSelectedId: string | null = editorState.itemId;
      if (editorState.mode === 'create') {
        const created = await createScript(payload);
        nextSelectedId = created.id;
      } else if (editorState.itemId) {
        const updated = await updateScript(editorState.itemId, payload);
        nextSelectedId = updated.id;
      }

      await reloadScripts(nextSelectedId);
      setEditorState(createEditorState(activeNodeId));
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : '脚本保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteScript() {
    if (!selectedScript) {
      return;
    }

    const confirmed = window.confirm(`确认删除脚本「${selectedScript.title}」吗？`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setExecuteError(null);

    try {
      await deleteScript(selectedScript.id);
      await reloadScripts(null);
    } catch (error) {
      setExecuteError(error instanceof Error ? error.message : '脚本删除失败。');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleExecuteScript() {
    if (!selectedScript) {
      return;
    }

    if (!activeSessionId) {
      setExecuteError('请先打开一个 SSH 会话，再执行脚本。');
      return;
    }

    if (selectedScript.kind === 'plain') {
      setExecuteError(null);
      onExecuteCommand(selectedScript.content);
      return;
    }

    const validation = validateScriptVariableValues(selectedScript.variables, variableValues);
    if (!validation.ok) {
      setExecuteError(validation.message);
      return;
    }

    setExecuteError(null);
    onExecuteCommand(renderScriptTemplate(selectedScript.content, variableValues));
  }

  return (
    <>
      <section className="flex h-full min-h-screen flex-col border-l border-[var(--app-border-default)] bg-[var(--app-bg-base)]">
        <header className="border-b border-[var(--app-border-default)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[var(--app-text-primary)]">脚本库</h2>
              <p className="text-xs text-[var(--app-text-secondary)]">
                直接向当前激活会话发送预设脚本，支持全局和节点覆盖。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setEditorError(null);
                  setEditorState({
                    open: true,
                    mode: 'create',
                    itemId: null,
                    draft: createEmptyScriptDraft(activeNodeId),
                    tagsText: '',
                  });
                }}
                size="sm"
              >
                新建脚本
              </Button>
              <Button onClick={onClose} size="sm" type="button" variant="ghost">
                关闭
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 alias、标题、key、描述、标签"
              value={query}
            />
            <div className="flex flex-wrap gap-2 text-xs text-[var(--app-text-secondary)]">
              <span className="rounded-full border border-neutral-800 px-2 py-1">
                当前会话: {activeSessionLabel ?? '未选择'}
              </span>
              <span className="rounded-full border border-neutral-800 px-2 py-1">
                当前节点: {activeNodeId ?? '无'}
              </span>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,260px)_minmax(0,1fr)]">
          <div className="overflow-y-auto border-b border-[var(--app-border-default)]">
            {isLoading ? (
              <div className="px-3 py-6 text-sm text-neutral-400">
                脚本列表加载中...
              </div>
            ) : errorMessage ? (
              <div className="px-3 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-3 py-6 text-sm text-neutral-400">
                当前没有可见脚本。
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_90px_90px] gap-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  <span>Alias</span>
                  <span>标题</span>
                  <span>作用域</span>
                  <span>类型</span>
                </div>
                <div className="divide-y divide-neutral-900/80">
                {filteredItems.map((item) => (
                  <button
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,120px)_minmax(0,1fr)_90px_90px] gap-3 px-3 py-2.5 text-left transition-colors',
                      item.id === selectedScript?.id
                        ? 'bg-blue-500/10 text-neutral-100'
                        : 'text-neutral-300 hover:bg-neutral-900/60'
                    )}
                    key={item.id}
                    onClick={() => {
                      setExecuteError(null);
                      setSelectedScriptId(item.id);
                    }}
                    type="button"
                  >
                    <span className="truncate font-mono text-[12px] text-blue-300">{item.alias}</span>
                    <span className="truncate text-sm">{item.title}</span>
                    <span className="text-xs text-neutral-400">{getScriptScopeLabel(item)}</span>
                    <span className="text-xs text-neutral-400">{item.kind}</span>
                  </button>
                ))}
                </div>
              </>
            )}
          </div>

          <div className="overflow-y-auto px-3 py-3">
            {selectedScript ? (
              <div className="space-y-3">
                <SectionCard
                  actions={
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          setEditorError(null);
                          setEditorState(buildEditorStateFromItem(selectedScript));
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        编辑
                      </Button>
                      <Button
                        disabled={isDeleting}
                        onClick={() => {
                          void handleDeleteScript();
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        {isDeleting ? '删除中...' : '删除'}
                      </Button>
                    </div>
                  }
                  description={selectedScript.description || '无额外说明'}
                  title={selectedScript.title}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
                      <span className="rounded-full border border-neutral-800 px-2 py-1">
                        {selectedScript.kind === 'plain' ? '纯文本脚本' : '模板脚本'}
                      </span>
                      <span className="rounded-full border border-neutral-800 px-2 py-1">
                        {getScriptScopeLabel(selectedScript)}
                      </span>
                      <span className="rounded-full border border-neutral-800 px-2 py-1">
                        目标会话: {activeSessionLabel ?? '未选择'}
                      </span>
                    </div>

                    <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3">
                      <pre className="whitespace-pre-wrap break-words text-xs text-neutral-200">
                        {selectedScript.content}
                      </pre>
                    </div>

                    {selectedScript.kind === 'template' ? (
                      <div className="grid gap-3">
                        {selectedScript.variables.map((variable) => (
                          <div className="grid gap-2" key={variable.name}>
                            <Label htmlFor={`script-variable-${variable.name}`}>
                              {variable.label}
                              {variable.required ? ' *' : ''}
                            </Label>
                            {variable.inputType === 'textarea' ? (
                              <Textarea
                                id={`script-variable-${variable.name}`}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setVariableValues((current) => ({
                                    ...current,
                                    [variable.name]: value,
                                  }));
                                }}
                                placeholder={variable.placeholder}
                                value={variableValues[variable.name] ?? ''}
                              />
                            ) : (
                              <Input
                                id={`script-variable-${variable.name}`}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setVariableValues((current) => ({
                                    ...current,
                                    [variable.name]: value,
                                  }));
                                }}
                                placeholder={variable.placeholder}
                                value={variableValues[variable.name] ?? ''}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {executeError ? (
                      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {executeError}
                      </div>
                    ) : null}

                    <Button onClick={handleExecuteScript} type="button">
                      执行到当前会话
                    </Button>
                  </div>
                </SectionCard>
              </div>
            ) : (
              <SectionCard
                description="可以新建一个全局脚本，或者在当前节点上创建覆盖脚本。"
                title="还没有选中脚本"
              >
                <div className="space-y-3 text-sm text-neutral-400">
                  <p>支持两种类型：</p>
                  <ul className="space-y-1 text-xs text-neutral-500">
                    <li>plain: 直接把内容发到当前会话</li>
                    <li>template: 填好变量后再渲染执行</li>
                  </ul>
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </section>

      <ScriptLibraryEditorDialog
        activeNodeId={activeNodeId}
        errorMessage={editorError}
        isSaving={isSaving}
        onClose={() => {
          setEditorError(null);
          setEditorState(createEditorState(activeNodeId));
        }}
        onSave={() => {
          void handleSaveScript();
        }}
        onStateChange={setEditorState}
        state={editorState}
      />
    </>
  );
}
