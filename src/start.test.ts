import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mystmdMissing, startMyst } from './start.ts';

test('reports a missing mystmd as mystmdMissing', async () => {
  process.env.MYST_BIN = '/nonexistent/myst';
  const myst = await startMyst('.');
  await assert.rejects(myst.exited, { message: mystmdMissing });
});

test('exited rejects when mystmd dies', async () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'myst-')), 'myst');
  writeFileSync(bin, '#!/bin/sh\nexit 3\n');
  chmodSync(bin, 0o755);
  process.env.MYST_BIN = bin;
  const myst = await startMyst('.');
  await assert.rejects(myst.exited, { message: 'myst exited with code 3' });
});
