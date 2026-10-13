import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mystmdMissing } from './content-server.ts';
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
