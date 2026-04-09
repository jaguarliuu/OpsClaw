import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themedFiles = [
  '../../routes/SettingsPage.tsx',
  '../workbench/TerminalSettingsTab.tsx',
  '../workbench/MemorySettings.tsx',
  '../workbench/LlmSettings.tsx',
  '../workbench/LlmProviderBasicsSection.tsx',
  '../workbench/LlmProviderModelSection.tsx',
  '../workbench/LlmProviderListSection.tsx',
  '../workbench/LlmProviderSubmitSection.tsx',
  '../workbench/ScriptSettingsTab.tsx',
  '../../components/ui/input.tsx',
  '../../components/ui/textarea.tsx',
  '../../components/ui/select.tsx',
] as const;

void test('settings surfaces rely on app theme variables instead of hard-coded dark palette tokens', () => {
  const hardcodedThemeTokenPattern =
    /#0a0b0d|#111214|#17181b|#1e2025|bg-neutral-(800|900|950)|border-neutral-(700|800)|text-neutral-(100|200|300|400|500|600)/;

  for (const relativePath of themedFiles) {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      hardcodedThemeTokenPattern,
      `expected ${relativePath} to avoid hard-coded theme tokens`
    );
  }
});
