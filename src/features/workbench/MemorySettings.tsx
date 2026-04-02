import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchGlobalMemory,
  fetchGroupMemory,
  fetchGroups,
  fetchNodeMemory,
  fetchNodes,
  updateGlobalMemory,
  updateGroupMemory,
  updateNodeMemory,
  type GroupRecord,
  type NodeSummaryRecord,
} from './api';
import type { MemoryDocument } from './types';

type MemoryScopeTab = 'global' | 'group' | 'node';

export function MemorySettings() {
  const [scope, setScope] = useState<MemoryScopeTab>('global');
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [nodes, setNodes] = useState<NodeSummaryRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [document, setDocument] = useState<MemoryDocument | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchGroups(), fetchNodes()]).then(([groupItems, nodeItems]) => {
      setGroups(groupItems);
      setNodes(nodeItems);
      if (groupItems[0]) {
        setSelectedGroupId(groupItems[0].id);
      }
      if (nodeItems[0]) {
        setSelectedNodeId(nodeItems[0].id);
      }
    });
  }, []);

  const selectedTitle = useMemo(() => {
    if (scope === 'global') {
      return '全局 MEMORY.md';
    }

    if (scope === 'group') {
      return groups.find((group) => group.id === selectedGroupId)?.name ?? '选择分组';
    }

    return nodes.find((node) => node.id === selectedNodeId)?.name ?? '选择节点';
  }, [groups, nodes, scope, selectedGroupId, selectedNodeId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let nextDocument: MemoryDocument;

        if (scope === 'global') {
          nextDocument = await fetchGlobalMemory();
        } else if (scope === 'group') {
          if (!selectedGroupId) {
            setDocument(null);
            setDraft('');
            return;
          }
          nextDocument = await fetchGroupMemory(selectedGroupId);
        } else {
          if (!selectedNodeId) {
            setDocument(null);
            setDraft('');
            return;
          }
          nextDocument = await fetchNodeMemory(selectedNodeId);
        }

        if (cancelled) {
          return;
        }

        setDocument(nextDocument);
        setDraft(nextDocument.content);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '记忆文档读取失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [scope, selectedGroupId, selectedNodeId]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      let nextDocument: MemoryDocument;

      if (scope === 'global') {
        nextDocument = await updateGlobalMemory(draft);
      } else if (scope === 'group') {
        nextDocument = await updateGroupMemory(selectedGroupId, draft);
      } else {
        nextDocument = await updateNodeMemory(selectedNodeId, draft);
      }

      setDocument(nextDocument);
      setDraft(nextDocument.content);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '记忆文档保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <h3 className="text-base font-semibold tracking-tight">记忆文档</h3>
        <p className="mt-1 text-sm text-neutral-500">
          全局记忆每次 Agent 运行都会加载；分组和节点记忆在需要时通过工具按需读取。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5 rounded-xl border border-neutral-800/50 bg-[#17181b] p-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-neutral-300">记忆范围</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as MemoryScopeTab)}>
              <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">全局 MEMORY.md</SelectItem>
                <SelectItem value="group">分组记忆</SelectItem>
                <SelectItem value="node">节点记忆</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'group' ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">分组</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50">
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {scope === 'node' ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">节点</Label>
              <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
                <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50">
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

          <div className="rounded-lg border border-neutral-800/60 bg-[#0a0b0d]/70 px-3 py-3 text-xs text-neutral-400">
            <div className="mb-1 text-neutral-200">当前文档</div>
            <div>{selectedTitle}</div>
            <div className="mt-2 break-all text-neutral-500">{document?.path ?? '-'}</div>
            <div className="mt-2 text-neutral-500">
              {document?.updatedAt ? `最近更新：${document.updatedAt}` : '文档尚未创建'}
            </div>
          </div>

          <Button
            onClick={() => void handleSave()}
            disabled={isSaving || isLoading || (scope !== 'global' && !document)}
            className="w-full"
          >
            {isSaving ? '保存中...' : '保存记忆'}
          </Button>

          {error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="space-y-3 rounded-xl border border-neutral-800/50 bg-[#17181b] p-5">
            <div>
              <h4 className="text-sm font-medium text-neutral-100">编辑器</h4>
              <p className="mt-1 text-xs text-neutral-500">使用 Markdown 编写记忆内容。</p>
            </div>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="在这里编写记忆内容..."
              className="min-h-[520px] resize-y bg-[#0a0b0d] border-neutral-800/50 font-mono text-sm"
            />
          </section>

          <section className="space-y-3 rounded-xl border border-neutral-800/50 bg-[#17181b] p-5">
            <div>
              <h4 className="text-sm font-medium text-neutral-100">预览</h4>
              <p className="mt-1 text-xs text-neutral-500">实时查看 Markdown 渲染效果。</p>
            </div>
            <div className="min-h-[520px] rounded-xl border border-neutral-800/50 bg-[#0a0b0d] p-4">
              {isLoading ? (
                <div className="text-sm text-neutral-500">加载中...</div>
              ) : draft.trim() ? (
                <MarkdownContent content={draft} className="text-sm leading-relaxed text-neutral-100" />
              ) : (
                <div className="text-sm text-neutral-600">当前文档为空。</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
