import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_INTAKE } from './demo.ts';

test('actual CLI JSONL batch persists and CLI replay reproduces both calls', async t => {
  const root = await mkdtemp(join(tmpdir(), 'visa-cli-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const requestFile = join(root, 'requests.jsonl');
  const departure = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  await writeFile(requestFile, [
    {action: 'intake', expectedRevision: 0, input: {...SAMPLE_INTAKE, plannedDepartureDate: departure}},
    {action: 'judge_type', expectedRevision: 1},
  ].map(r => JSON.stringify(r)).join('\n'));
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
  const invoke = (args: string[]) => execFileSync(process.execPath, ['--experimental-strip-types', cli, ...args], {encoding: 'utf8'}).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const calls = invoke(['batch', root, requestFile]);
  assert.equal(calls.length, 2); assert.equal(calls[1].state.visaType.code, 'DEMO-BUSINESS');
  const replay = invoke(['replay', root]);
  assert.deepEqual(replay.at(-1), {total: 2, failed: 0});
});
