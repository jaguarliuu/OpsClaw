import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveMemoryRootDir, resolveOpsClawDataDir } from '../runtimePaths.js';

export type MemoryScope = 'global' | 'group' | 'node';

export type MemoryDocument = {
  scope: MemoryScope;
  id: string | null;
  title: string;
  path: string;
  content: string;
  exists: boolean;
  updatedAt: string | null;
};

export type MemoryWriteMode = 'replace' | 'append';

function getMemoryRootDir() {
  return resolveMemoryRootDir(
    resolveOpsClawDataDir({
      cwd: process.cwd(),
      env: process.env,
    })
  );
}

function buildDocumentPath(scope: MemoryScope, id?: string) {
  const memoryRootDir = getMemoryRootDir();
  if (scope === 'global') {
    return path.join(memoryRootDir, 'MEMORY.md');
  }

  if (!id) {
    throw new Error('缺少记忆文档标识。');
  }

  return path.join(memoryRootDir, `${scope}s`, id, 'MEMORY.md');
}

async function readDocument(
  scope: MemoryScope,
  title: string,
  id?: string
): Promise<MemoryDocument> {
  const documentPath = buildDocumentPath(scope, id);

  try {
    const [content, fileStat] = await Promise.all([
      readFile(documentPath, 'utf8'),
      stat(documentPath),
    ]);

    return {
      scope,
      id: id ?? null,
      title,
      path: documentPath,
      content,
      exists: true,
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return {
      scope,
      id: id ?? null,
      title,
      path: documentPath,
      content: '',
      exists: false,
      updatedAt: null,
    };
  }
}

async function writeDocument(
  scope: MemoryScope,
  title: string,
  content: string,
  id?: string
): Promise<MemoryDocument> {
  const documentPath = buildDocumentPath(scope, id);
  await mkdir(path.dirname(documentPath), { recursive: true });
  await writeFile(documentPath, content, 'utf8');

  const fileStat = await stat(documentPath);
  return {
    scope,
    id: id ?? null,
    title,
    path: documentPath,
    content,
    exists: true,
    updatedAt: fileStat.mtime.toISOString(),
  };
}

function buildInitialDocument(title: string) {
  return `# ${title}\n\n## 背景\n\n## 关键事实\n\n## 操作约定\n\n## 自动沉淀\n`;
}

function appendAutoSection(
  existingContent: string,
  title: string,
  entryMarkdown: string
) {
  const baseContent = existingContent.trim() ? existingContent : buildInitialDocument(title).trim();
  const sectionHeading = '## 自动沉淀';

  if (!baseContent.includes(sectionHeading)) {
    return `${baseContent}\n\n${sectionHeading}\n\n${entryMarkdown}\n`;
  }

  const sectionIndex = baseContent.indexOf(sectionHeading);
  const afterHeading = baseContent.slice(sectionIndex + sectionHeading.length);
  const nextSectionMatch = afterHeading.match(/\n##\s/);
  if (nextSectionMatch?.index !== undefined) {
    const insertAt = sectionIndex + sectionHeading.length + nextSectionMatch.index;
    return `${baseContent.slice(0, insertAt)}\n\n${entryMarkdown}${baseContent.slice(insertAt)}`;
  }

  return `${baseContent.trimEnd()}\n\n${entryMarkdown}\n`;
}

export class FileMemoryStore {
  async readGlobalMemory() {
    return readDocument('global', '全局记忆');
  }

  async writeGlobalMemory(content: string) {
    return writeDocument('global', '全局记忆', content);
  }

  async appendGlobalMemory(content: string) {
    const existing = await this.readGlobalMemory();
    return writeDocument('global', '全局记忆', `${existing.content.trim()}\n\n${content}`.trim());
  }

  async updateMemorySection(
    scope: MemoryScope,
    title: string,
    section: string,
    content: string,
    id?: string
  ): Promise<MemoryDocument> {
    const existing = await readDocument(scope, title, id);
    const baseContent = existing.content.trim() || buildInitialDocument(title).trim();
    const heading = `## ${section}`;

    if (!baseContent.includes(heading)) {
      return writeDocument(scope, title, `${baseContent}\n\n${heading}\n\n${content}\n`, id);
    }

    const headingIndex = baseContent.indexOf(heading);
    const afterHeading = baseContent.slice(headingIndex + heading.length);
    const nextMatch = afterHeading.match(/\n##\s/);
    if (nextMatch?.index !== undefined) {
      const before = baseContent.slice(0, headingIndex);
      const after = afterHeading.slice(nextMatch.index);
      return writeDocument(scope, title, `${before}${heading}\n\n${content}${after}`, id);
    }

    return writeDocument(scope, title, `${baseContent.slice(0, headingIndex)}${heading}\n\n${content}\n`, id);
  }

  async readGroupMemory(groupId: string, groupName: string) {
    return readDocument('group', `分组记忆 · ${groupName}`, groupId);
  }

  async writeGroupMemory(groupId: string, groupName: string, content: string) {
    return writeDocument('group', `分组记忆 · ${groupName}`, content, groupId);
  }

  async appendGroupMemory(groupId: string, groupName: string, content: string) {
    const existing = await this.readGroupMemory(groupId, groupName);
    return writeDocument(
      'group',
      `分组记忆 · ${groupName}`,
      `${existing.content.trim()}\n\n${content}`.trim(),
      groupId
    );
  }

  async readNodeMemory(nodeId: string, nodeName: string) {
    return readDocument('node', `节点记忆 · ${nodeName}`, nodeId);
  }

  async writeNodeMemory(nodeId: string, nodeName: string, content: string) {
    return writeDocument('node', `节点记忆 · ${nodeName}`, content, nodeId);
  }

  async appendNodeMemory(nodeId: string, nodeName: string, content: string) {
    const existing = await this.readNodeMemory(nodeId, nodeName);
    return writeDocument(
      'node',
      `节点记忆 · ${nodeName}`,
      `${existing.content.trim()}\n\n${content}`.trim(),
      nodeId
    );
  }

  async appendAutoNodeMemoryEntry(nodeId: string, nodeName: string, entryMarkdown: string) {
    const existing = await this.readNodeMemory(nodeId, nodeName);
    return writeDocument(
      'node',
      `节点记忆 · ${nodeName}`,
      appendAutoSection(existing.content, `节点记忆 · ${nodeName}`, entryMarkdown),
      nodeId
    );
  }

  async appendAutoGroupMemoryEntry(groupId: string, groupName: string, entryMarkdown: string) {
    const existing = await this.readGroupMemory(groupId, groupName);
    return writeDocument(
      'group',
      `分组记忆 · ${groupName}`,
      appendAutoSection(existing.content, `分组记忆 · ${groupName}`, entryMarkdown),
      groupId
    );
  }
}
