import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';

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
import { fetchNodes, type NodeSummaryRecord } from '@/features/workbench/api';
import {
  createScript,
  deleteScript,
  fetchManagedScripts,
  updateScript,
} from '@/features/workbench/scriptApi';
import {
  extractTemplateVariableNames,
  validateScriptAlias,
} from '@/features/workbench/scriptLibraryModel';
import {
  assertScriptUsageForEditor,
  buildInitialScriptSettingsView,
  buildScriptUsageBadgeLabel,
  buildScriptUsageFilterOptions,
  buildManagedScriptQuery,
  buildScriptSettingsEmptyState,
  buildScriptSettingsIntro,
  normalizeTemplateVariableDefinitions,
  type ScriptSettingsScope,
  type ScriptUsageFilter,
  validateTemplateScriptDefinition,
} from '@/features/workbench/scriptSettingsModel';
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_PANEL_CLASS,
  SETTINGS_PANEL_MUTED_CLASS,
  SETTINGS_SUBPANEL_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from '@/features/workbench/settingsTheme';
import type {
  ManagedScriptLibraryItem,
  ScriptLibraryUpsertInput,
  ScriptScope,
  ScriptUsage,
  ScriptVariableDefinition,
} from '@/features/workbench/types';
import { cn } from '@/lib/utils';

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

function filterManagedScriptItems(items: ManagedScriptLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystacks = [item.alias, item.title, item.key, item.description, ...item.tags];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

function createEmptyScriptDraft(
  scope: ScriptSettingsScope,
  selectedNodeId: string | null,
  usage: ScriptUsage = 'quick_run'
): ScriptLibraryUpsertInput {
  return {
    key: '',
    alias: '',
    scope,
    nodeId: scope === 'node' ? selectedNodeId : null,
    title: '',
    description: '',
    kind: 'plain',
    usage,
    content: '',
    variables: [],
    tags: [],
  };
}

function createEditorState(
  scope: ScriptSettingsScope,
  selectedNodeId: string | null,
  usage: ScriptUsage = 'quick_run'
): EditorState {
  return {
    open: false,
    mode: 'create',
    itemId: null,
    draft: createEmptyScriptDraft(scope, selectedNodeId, usage),
    tagsText: '',
  };
}

function buildEditorStateFromItem(item: ManagedScriptLibraryItem): EditorState {
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
      usage: assertScriptUsageForEditor(item.usage),
      content: item.content,
      variables: item.variables.map((variable) => ({ ...variable })),
      tags: [...item.tags],
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
    usage: editorState.draft.usage,
    content: editorState.draft.content,
    variables:
      editorState.draft.kind === 'template'
        ? normalizeTemplateVariableDefinitions(editorState.draft.variables)
        : [],
    tags: parseTags(editorState.tagsText),
  };
}

function getManagedScriptScopeLabel(item: ManagedScriptLibraryItem) {
  return item.scope === 'node' ? '节点脚本' : '全局脚本';
}

const SCRIPT_USAGE_FILTER_OPTIONS = buildScriptUsageFilterOptions();

function ScriptSettingsEditorDialog({
  errorMessage,
  isSaving,
  nodeSelectionLocked,
  nodes,
  onClose,
  onSave,
  onStateChange,
  state,
}: {
  errorMessage: string | null;
  isSaving: boolean;
  nodeSelectionLocked: boolean;
  nodes: NodeSummaryRecord[];
  onClose: () => void;
  onSave: () => void;
  onStateChange: (updater: (current: EditorState) => EditorState) => void;
  state: EditorState;
}) {
  const usedVariables = extractTemplateVariableNames(state.draft.content);

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.mode === 'create' ? '新建脚本' : '编辑脚本'}</DialogTitle>
          <DialogDescription>
            在设置页中集中维护全局脚本和节点脚本；执行请回到终端输入 x alias。
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
                    nodeId: value === 'node' ? (current.draft.nodeId ?? nodes[0]?.id ?? null) : null,
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
                {nodes.length > 0 ? <SelectItem value="node">节点脚本</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>

          {state.draft.scope === 'node' ? (
            <div className="grid gap-2">
              <Label htmlFor="script-node">节点</Label>
              {nodeSelectionLocked ? (
                <div className={`${SETTINGS_SUBPANEL_CLASS} px-3 py-2 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                  {nodes[0]?.name ?? '当前节点'}
                </div>
              ) : (
                <Select
                  onValueChange={(value) => {
                    onStateChange((current) => ({
                      ...current,
                      draft: {
                        ...current.draft,
                        nodeId: value,
                      },
                    }));
                  }}
                  value={state.draft.nodeId ?? ''}
                >
                  <SelectTrigger id="script-node">
                    <SelectValue placeholder="选择节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

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
                onChange={(event) => {
                  const value = event.target.value;
                  onStateChange((current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      alias: value,
                    },
                  }));
                }}
                placeholder="例如 nginx-restart"
                value={state.draft.alias}
              />
              <p className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                终端中输入 x {state.draft.alias || '<alias>'} 可快捷执行。
              </p>
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
            <Label htmlFor="script-usage">用途</Label>
            <Select
              onValueChange={(value: ScriptUsage) => {
                onStateChange((current) => ({
                  ...current,
                  draft: {
                    ...current.draft,
                    usage: value,
                  },
                }));
              }}
              value={state.draft.usage}
            >
              <SelectTrigger id="script-usage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick_run">快捷执行</SelectItem>
                <SelectItem value="inspection">巡检脚本</SelectItem>
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
              <p className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                当前识别到的占位符: {usedVariables.length > 0 ? usedVariables.join(', ') : '无'}
              </p>
            ) : null}
          </div>

          {state.draft.kind === 'template' ? (
            <div className={`${SETTINGS_SUBPANEL_CLASS} grid gap-3 p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>模板变量</h3>
                  <p className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                    变量名要与 ${'{name}'} 占位一致。
                  </p>
                </div>
                <Button
                  onClick={() => {
                    onStateChange((current) => ({
                      ...current,
                      draft: {
                        ...current.draft,
                        variables: [...current.draft.variables, { ...EMPTY_VARIABLE }],
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
                    <div
                      className={`${SETTINGS_SUBPANEL_CLASS} grid gap-3 p-3`}
                      key={`${variable.name || 'var'}-${index}`}
                    >
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
                        <label className={`flex items-center gap-2 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                          <input
                            checked={variable.required}
                            className="h-4 w-4 rounded border border-[var(--app-border-default)] bg-[var(--app-bg-base)]"
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
                                variables: current.draft.variables.filter(
                                  (_item, itemIndex) => itemIndex !== index
                                ),
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
                <div className={`rounded-md border border-dashed border-[var(--app-border-default)] px-3 py-4 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
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

export function ScriptSettingsTab() {
  const [searchParams] = useSearchParams();
  const initialView = useMemo(
    () => buildInitialScriptSettingsView(searchParams),
    [searchParams]
  );
  const [scope, setScope] = useState<ScriptSettingsScope>(initialView.scope);
  const [usageFilter, setUsageFilter] = useState<ScriptUsageFilter>(initialView.usageFilter);
  const [selectedNodeId, setSelectedNodeId] = useState(initialView.selectedNodeId);
  const [nodes, setNodes] = useState<NodeSummaryRecord[]>([]);
  const [items, setItems] = useState<ManagedScriptLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(initialView.selectedScriptId);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createEditorState('global', null)
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setScope(initialView.scope);
    setUsageFilter(initialView.usageFilter);
    setSelectedNodeId(initialView.selectedNodeId);
    setQuery('');
    setSelectedScriptId(initialView.selectedScriptId);
    setEditorError(null);
    setEditorState(
      createEditorState(
        initialView.scope,
        initialView.scope === 'node' ? initialView.selectedNodeId || null : null,
        initialView.usageFilter === 'all' ? 'quick_run' : initialView.usageFilter
      )
    );
  }, [initialView]);

  useEffect(() => {
    let cancelled = false;

    void fetchNodes()
      .then((nextNodes) => {
        if (cancelled) {
          return;
        }

        setNodes(nextNodes);
        setSelectedNodeId((current) => current || nextNodes[0]?.id || '');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setNodes([]);
        setSelectedNodeId('');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const managedQuery = buildManagedScriptQuery({ scope, selectedNodeId, usage: usageFilter });
      if (managedQuery.scope === 'node' && !managedQuery.nodeId) {
        setIsLoading(false);
        setErrorMessage(null);
        setItems([]);
        setSelectedScriptId(null);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextItems = await fetchManagedScripts(managedQuery);
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
  }, [scope, selectedNodeId, usageFilter]);

  const filteredItems = useMemo(
    () => filterManagedScriptItems(items, deferredQuery),
    [deferredQuery, items]
  );
  const selectedScript =
    filteredItems.find((item) => item.id === selectedScriptId) ??
    filteredItems[0] ??
    null;
  const selectedNodeName = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId)?.name ?? '未选择节点',
    [nodes, selectedNodeId]
  );
  const editorNodes = useMemo(() => {
    if (scope !== 'node' || !selectedNodeId) {
      return nodes;
    }

    return nodes.filter((node) => node.id === selectedNodeId);
  }, [nodes, scope, selectedNodeId]);
  const emptyStateMessage = buildScriptSettingsEmptyState({
    scope,
    hasNodes: nodes.length > 0,
    hasQuery: deferredQuery.trim() !== '',
    hasItems: filteredItems.length > 0,
  });

  useEffect(() => {
    if (selectedScript && selectedScriptId !== selectedScript.id) {
      setSelectedScriptId(selectedScript.id);
    }
  }, [selectedScript, selectedScriptId]);

  async function reloadScripts(nextSelectedId?: string | null) {
    const managedQuery = buildManagedScriptQuery({ scope, selectedNodeId, usage: usageFilter });
    if (managedQuery.scope === 'node' && !managedQuery.nodeId) {
      startTransition(() => {
        setItems([]);
        setSelectedScriptId(null);
      });
      return;
    }

    const nextItems = await fetchManagedScripts(managedQuery);
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
      if (scope === 'node' && payload.scope === 'node') {
        payload.nodeId = selectedNodeId || payload.nodeId;
      }
      const aliasValidation = validateScriptAlias(payload.alias);
      if (!aliasValidation.ok) {
        setEditorError(aliasValidation.message);
        return;
      }
      if (payload.scope === 'node' && !payload.nodeId) {
        setEditorError('节点脚本必须绑定节点，请先选择节点后再保存。');
        return;
      }
      if (payload.kind === 'template') {
        const templateValidation = validateTemplateScriptDefinition(
          payload.content,
          payload.variables
        );
        if (!templateValidation.ok) {
          setEditorError(templateValidation.message);
          return;
        }
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
      setEditorState(
        createEditorState(
          scope,
          scope === 'node' ? selectedNodeId || null : null,
          usageFilter === 'all' ? 'quick_run' : usageFilter
        )
      );
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

    const scopeDetail =
      selectedScript.scope === 'node'
        ? `节点脚本 · ${nodes.find((node) => node.id === selectedScript.nodeId)?.name ?? selectedScript.nodeId}`
        : '全局脚本';
    const confirmed = window.confirm(
      `确认删除脚本「${selectedScript.title || selectedScript.alias}」(${selectedScript.alias} · ${scopeDetail}) 吗？`
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteScript(selectedScript.id);
      await reloadScripts(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '脚本删除失败。');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-8">
        <div className="mb-2">
          <h3 className="text-base font-semibold tracking-tight">脚本</h3>
          <p className={`mt-1 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>{buildScriptSettingsIntro()}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`${SETTINGS_PANEL_CLASS} space-y-5 p-5`}>
            <div className="space-y-2">
              <Label className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>脚本范围</Label>
              <Select
                value={scope}
                onValueChange={(value) => {
                  setScope(value as ScriptSettingsScope);
                  setQuery('');
                }}
              >
                <SelectTrigger className={`h-10 ${SETTINGS_INPUT_CLASS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">全局脚本</SelectItem>
                  <SelectItem value="node">节点脚本</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'node' ? (
              <div className="space-y-2">
                <Label className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>节点</Label>
                <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
                  <SelectTrigger className={`h-10 ${SETTINGS_INPUT_CLASS}`}>
                    <SelectValue placeholder="选择节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-3 py-3 text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
              <div className={`mb-1 ${SETTINGS_TEXT_PRIMARY_CLASS}`}>当前视角</div>
              <div>{scope === 'global' ? '全局脚本资产' : `节点脚本 · ${selectedNodeName}`}</div>
              <div className={`mt-2 ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                {scope === 'global'
                  ? '全局脚本会在终端按 alias 直接解析。'
                  : '节点脚本只显示当前选中节点下维护的原始记录。'}
              </div>
              <div className={`mt-2 ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                {usageFilter === 'quick_run'
                  ? '当前只查看可用于 x alias 的快捷执行脚本。'
                  : usageFilter === 'inspection'
                    ? '当前只查看巡检脚本。'
                    : '当前显示全部用途。'}
              </div>
            </div>
          </aside>

          <section className={`${SETTINGS_PANEL_CLASS} space-y-4 p-5`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row">
                <Input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索 alias、标题、key、描述、标签"
                  value={query}
                />
                <Select
                  value={usageFilter}
                  onValueChange={(value) => {
                    setUsageFilter(value as ScriptUsageFilter);
                    setQuery('');
                  }}
                >
                  <SelectTrigger className={`w-full md:w-[150px] ${SETTINGS_INPUT_CLASS}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCRIPT_USAGE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={scope === 'node' && nodes.length === 0}
                onClick={() => {
                  setEditorError(null);
                  setEditorState({
                    open: true,
                    mode: 'create',
                    itemId: null,
                    draft: createEmptyScriptDraft(
                      scope,
                      scope === 'node' ? selectedNodeId || null : null,
                      usageFilter === 'all' ? 'quick_run' : usageFilter
                    ),
                    tagsText: '',
                  });
                }}
                type="button"
              >
                新建脚本
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className={`${SETTINGS_PANEL_MUTED_CLASS} overflow-hidden`}>
                <div className={`grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_72px] gap-3 border-b border-[var(--app-border-default)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                  <span>Alias</span>
                  <span>标题</span>
                  <span>类型</span>
                </div>

                <div className="max-h-[560px] overflow-y-auto">
                  {isLoading ? (
                    <div className={`px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>脚本列表加载中...</div>
                  ) : errorMessage ? (
                    <div className="px-4 py-6 text-sm text-red-200">{errorMessage}</div>
                  ) : filteredItems.length === 0 ? (
                    <div className={`px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>{emptyStateMessage}</div>
                  ) : (
                    <div className="divide-y divide-[var(--app-border-default)]">
                      {filteredItems.map((item) => (
                        <button
                          className={cn(
                            'grid w-full grid-cols-[minmax(0,120px)_minmax(0,1fr)_72px] gap-3 px-4 py-3 text-left transition-colors',
                            item.id === selectedScript?.id
                              ? 'bg-blue-500/10 text-[var(--app-text-primary)]'
                              : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-elevated3)]'
                          )}
                          key={item.id}
                          onClick={() => setSelectedScriptId(item.id)}
                          type="button"
                        >
                          <span className="truncate font-mono text-[12px] text-blue-300">
                            {item.alias}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{item.title}</span>
                            <span className={`mt-1 block truncate text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                              {getManagedScriptScopeLabel(item)}
                              {buildScriptUsageBadgeLabel(item.usage)
                                ? ` · ${buildScriptUsageBadgeLabel(item.usage)}`
                                : ''}
                              {item.tags.length > 0 ? ` · ${item.tags.join(', ')}` : ''}
                            </span>
                          </span>
                          <span className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>{item.kind}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-[420px]">
                {selectedScript ? (
                  <SectionCard
                    actions={
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            try {
                              setEditorError(null);
                              setEditorState(buildEditorStateFromItem(selectedScript));
                            } catch (error) {
                              setEditorError(error instanceof Error ? error.message : '脚本编辑器打开失败。');
                            }
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
                    className={`h-full border-[var(--app-border-default)] bg-[var(--app-bg-base)]`}
                    description={selectedScript.description || '无额外说明'}
                    title={selectedScript.title}
                  >
                    <div className="space-y-4">
                      <div className={`flex flex-wrap gap-2 text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                        <span className="rounded-full border border-[var(--app-border-default)] px-2 py-1">
                          {selectedScript.kind === 'plain' ? '纯文本脚本' : '模板脚本'}
                        </span>
                        <span className="rounded-full border border-[var(--app-border-default)] px-2 py-1">
                          {getManagedScriptScopeLabel(selectedScript)}
                        </span>
                        {buildScriptUsageBadgeLabel(selectedScript.usage) ? (
                          <span className="rounded-full border border-[var(--app-border-default)] px-2 py-1">
                            {buildScriptUsageBadgeLabel(selectedScript.usage)}
                          </span>
                        ) : null}
                        {selectedScript.scope === 'node' ? (
                          <span className="rounded-full border border-[var(--app-border-default)] px-2 py-1">
                            节点: {nodes.find((node) => node.id === selectedScript.nodeId)?.name ?? selectedScript.nodeId}
                          </span>
                        ) : null}
                      </div>

                      <div className={`${SETTINGS_SUBPANEL_CLASS} p-3`}>
                        <div className={`mb-2 text-xs uppercase tracking-[0.18em] ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                          脚本内容
                        </div>
                        <pre className={`whitespace-pre-wrap break-words text-xs ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                          {selectedScript.content}
                        </pre>
                      </div>

                      {selectedScript.tags.length > 0 ? (
                        <div className="space-y-2">
                          <div className={`text-xs uppercase tracking-[0.18em] ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                            标签
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedScript.tags.map((tag) => (
                              <span
                                className="rounded-full border border-[var(--app-border-default)] px-2 py-1 text-xs text-[var(--app-text-secondary)]"
                                key={tag}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedScript.kind === 'template' ? (
                        <div className="space-y-3">
                          <div className={`text-xs uppercase tracking-[0.18em] ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                            模板变量
                          </div>
                          {selectedScript.variables.length > 0 ? (
                            <div className="grid gap-3">
                              {selectedScript.variables.map((variable) => (
                                <div
                                  className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-3`}
                                  key={variable.name}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                                        {variable.label || variable.name}
                                      </div>
                                      <div className={`mt-1 text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                                        {variable.name}
                                        {variable.required ? ' · 必填' : ' · 选填'}
                                        {variable.placeholder ? ` · ${variable.placeholder}` : ''}
                                      </div>
                                    </div>
                                    <span className={`text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                                      {variable.inputType === 'textarea' ? '多行' : '单行'}
                                    </span>
                                  </div>
                                  {variable.defaultValue ? (
                                    <div className={`mt-2 text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                                      默认值: {variable.defaultValue}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className={`rounded-md border border-dashed border-[var(--app-border-default)] px-3 py-4 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                              当前模板还没有变量定义。
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </SectionCard>
                ) : (
                  <SectionCard
                    className="h-full border-[var(--app-border-default)] bg-[var(--app-bg-base)]"
                    description="脚本用于沉淀固定操作，在终端通过 x alias 调用执行。"
                    title="还没有选中脚本"
                  >
                    <div className={`space-y-3 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                      <p>你可以在这里维护全局脚本，或切换到节点范围管理节点专属脚本。</p>
                      <ul className={`space-y-1 text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                        <li>plain: 直接保存固定命令内容</li>
                        <li>template: 保存带变量占位的脚本模板</li>
                      </ul>
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <ScriptSettingsEditorDialog
        errorMessage={editorError}
        isSaving={isSaving}
        nodeSelectionLocked={scope === 'node'}
        nodes={editorNodes}
        onClose={() => {
          setEditorError(null);
          setEditorState(
            createEditorState(
              scope,
              scope === 'node' ? selectedNodeId || null : null,
              usageFilter === 'all' ? 'quick_run' : usageFilter
            )
          );
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
