import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentServer, mystmdMissing } from './content-server.ts';
import { startMyst } from './start.ts';

test('reports a missing mystmd as mystmdMissing', async () => {
  process.env.MYST_BIN = '/nonexistent/myst';
  const myst = await startMyst('.', () => {});
  await assert.rejects(myst.ready, { message: mystmdMissing });
  await assert.rejects(myst.exited, { message: mystmdMissing });
});

test('passes args, logs output, and rejects exited when mystmd dies after it is ready', async () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'myst-')), 'myst');
  writeFileSync(bin, '#!/bin/sh\necho "Content server started $5"\nexit 3\n');
  chmodSync(bin, 0o755);
  process.env.MYST_BIN = bin;
  const lines: string[] = [];
  const myst = await startMyst('.', (line) => lines.push(line), ['--execute']);
  await myst.ready;
  await assert.rejects(myst.exited, { message: 'myst exited with code 3' });
  assert.deepEqual(lines, ['[myst] Content server started --execute']);
});

test('with real mystmd: serves the project at url and watch sees it', { skip: !process.env.TEST_MYSTMD, timeout: 90_000 }, async () => {
  delete process.env.MYST_BIN; // npm scripts put node_modules/.bin/myst on the PATH
  const root = mkdtempSync(join(tmpdir(), 'myst-'));
  writeFileSync(join(root, 'myst.yml'), 'version: 1\nproject:\n  id: test\nsite:\n  template: book-theme\n');
  writeFileSync(join(root, 'index.md'), '# Title\n');
  const myst = await startMyst(root, () => {});
  try {
    await myst.ready;
    const server = contentServer(myst.url);
    await new Promise<void>((resolve) => { const stop = server.watch(() => (stop(), resolve())); });
    assert.deepEqual((await server.pages()).map((p) => p.location), ['/index.md']);
  } finally {
    myst.stop();
  }
});
