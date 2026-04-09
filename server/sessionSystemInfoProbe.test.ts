import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSessionSystemInfoProbeCommand,
  parseSessionSystemInfoProbeOutput,
} from './sessionSystemInfoProbe.js';

void test('buildSessionSystemInfoProbeCommand gathers distro, package manager, kernel, arch, and shell in one probe', () => {
  const command = buildSessionSystemInfoProbeCommand();

  assert.match(command, /\/etc\/os-release/);
  assert.match(command, /uname -r/);
  assert.match(command, /uname -m/);
  assert.match(command, /\$\{SHELL:-unknown\}/);
  assert.match(command, /apt-get/);
  assert.match(command, /dnf/);
  assert.match(command, /yum/);
});

void test('parseSessionSystemInfoProbeOutput extracts the normalized cached system info payload', () => {
  const info = parseSessionSystemInfoProbeOutput([
    'DISTRO_ID=ubuntu',
    'VERSION_ID=22.04',
    'PACKAGE_MANAGER=apt',
    'KERNEL=6.8.0-40-generic',
    'ARCH=x86_64',
    'DEFAULT_SHELL=/bin/bash',
  ].join('\n'));

  assert.deepEqual(info, {
    distributionId: 'ubuntu',
    versionId: '22.04',
    packageManager: 'apt',
    kernel: '6.8.0-40-generic',
    architecture: 'x86_64',
    defaultShell: '/bin/bash',
  });
});

void test('parseSessionSystemInfoProbeOutput tolerates missing values and falls back to unknown labels', () => {
  const info = parseSessionSystemInfoProbeOutput([
    'DISTRO_ID=',
    'VERSION_ID=',
    'PACKAGE_MANAGER=',
    'KERNEL=',
    'ARCH=',
    'DEFAULT_SHELL=',
  ].join('\n'));

  assert.deepEqual(info, {
    distributionId: 'unknown',
    versionId: 'unknown',
    packageManager: 'unknown',
    kernel: 'unknown',
    architecture: 'unknown',
    defaultShell: 'unknown',
  });
});
