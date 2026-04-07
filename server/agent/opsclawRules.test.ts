import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  loadOpsClawRules,
  resolveEffectiveOpsClawRules,
} from './opsclawRules.js';

async function withTempRulesFile(
  contents: string,
  run: (rulesUrl: URL) => Promise<void>
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'opsclaw-rules-'));
  const rulesPath = join(tempDir, 'opsclaw.rules.yaml');
  await writeFile(rulesPath, contents, 'utf8');
  try {
    await run(pathToFileURL(rulesPath));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

void test(
  'loadOpsClawRules reads global rules and group overrides from opsclaw.rules.yaml',
  async () => {
    const rules = await loadOpsClawRules(
      new URL('../../opsclaw.rules.yaml', import.meta.url)
    );

    assert.equal(rules.version, 1);
    const userManagement = rules.global.intents.user_management;
    assert.ok(userManagement);
    assert.equal(userManagement.defaultRisk, 'high');
    const productionPackage = rules.groups.production?.intents.package_management;
    assert.ok(productionPackage);
    assert.equal(productionPackage.requireApproval, true);
  }
);

void test(
  'loadOpsClawRules fails when an intent has invalid defaultRisk',
  async () => {
    await withTempRulesFile(
      `
version: 1
global:
  intents:
    package_management:
      defaultRisk: critical
      requireApproval: false
      protectedParameters:
        - package_name
groups: {}
`,
      async (rulesUrl) => {
        await assert.rejects(
          () => loadOpsClawRules(rulesUrl),
          /defaultRisk/
        );
      }
    );
  }
);

void test(
  'loadOpsClawRules fails when a group override references an unknown intent key',
  async () => {
    await withTempRulesFile(
      `
version: 1
global:
  intents:
    package_management:
      defaultRisk: medium
      requireApproval: false
      protectedParameters:
        - package_name
groups:
  production:
    intents:
      user_management:
        requireApproval: true
`,
      async (rulesUrl) => {
        await assert.rejects(
          () => loadOpsClawRules(rulesUrl),
          /unknown intent/i
        );
      }
    );
  }
);

void test(
  'resolveEffectiveOpsClawRules overlays group policy on top of global defaults',
  async () => {
    const rules = await loadOpsClawRules(
      new URL('../../opsclaw.rules.yaml', import.meta.url)
    );
    const effective = resolveEffectiveOpsClawRules(rules, 'production');

    const effectivePackage = effective.intents.package_management;
    assert.ok(effectivePackage);
    assert.equal(effectivePackage.requireApproval, true);
    const effectiveUserManagement = effective.intents.user_management;
    assert.ok(effectiveUserManagement);
    assert.equal(
      effectiveUserManagement.protectedParameters.includes('username'),
      true
    );
  }
);
