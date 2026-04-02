import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadTerminalRuntime,
  resetTerminalRuntimeLoaderForTest,
  type TerminalRuntime,
} from './terminalRuntimeLoader.js';

void test('loadTerminalRuntime reuses the same pending runtime import', async () => {
  resetTerminalRuntimeLoaderForTest();

  const runtime = {
    Terminal: class Terminal {},
    FitAddon: class FitAddon {},
    SearchAddon: class SearchAddon {},
  } as unknown as TerminalRuntime;
  let loadCount = 0;

  const firstPromise = loadTerminalRuntime(async () => {
    loadCount += 1;
    return runtime;
  });
  const secondPromise = loadTerminalRuntime(async () => {
    loadCount += 1;
    return runtime;
  });

  assert.equal(loadCount, 1);
  assert.equal(firstPromise, secondPromise);
  assert.equal(await firstPromise, runtime);
});

void test('resetTerminalRuntimeLoaderForTest allows a fresh runtime import', async () => {
  resetTerminalRuntimeLoaderForTest();

  const firstRuntime = {
    Terminal: class FirstTerminal {},
    FitAddon: class FirstFitAddon {},
    SearchAddon: class FirstSearchAddon {},
  } as unknown as TerminalRuntime;
  const secondRuntime = {
    Terminal: class SecondTerminal {},
    FitAddon: class SecondFitAddon {},
    SearchAddon: class SecondSearchAddon {},
  } as unknown as TerminalRuntime;

  assert.equal(await loadTerminalRuntime(async () => firstRuntime), firstRuntime);

  resetTerminalRuntimeLoaderForTest();

  assert.equal(await loadTerminalRuntime(async () => secondRuntime), secondRuntime);
});
