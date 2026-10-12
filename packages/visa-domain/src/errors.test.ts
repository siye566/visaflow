import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeError, explainCode } from './errors.ts';
import { SAMPLE_INTAKE } from './demo.ts';

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
const invoke = (args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {encoding: 'utf8'});

test('stable guidance preserves safety gates without exposing input or private paths', () => {
  const diagnostic = describeError(new Error('REVISION_CONFLICT: private passport E00000001'));
  assert.equal(diagnostic.code, 'REVISION_CONFLICT');
  assert.equal(diagnostic.retryable, false);
  assert.match(diagnostic.action, /reconfirm/);
  assert.ok(!JSON.stringify(diagnostic).includes('E00000001'));
  assert.equal(describeError(new SyntaxError('private input')).code, 'INVALID_JSON');
  assert.equal(describeError(Object.assign(new Error('/private/path'), {code: 'EPERM'})).code, 'FILE_ACCESS_DENIED');
  assert.equal(explainCode('CASE_BUSY').retryable, true);
  assert.equal(explainCode('APPROVAL_FORBIDDEN').retryable, false);
  assert.equal(describeError(new Error('unknown secret')).code, 'INTERNAL_ERROR');
});

test('CLI doctor and explain are credential-free discovery endpoints', () => {
  const doctor = invoke(['doctor']);
  assert.equal(doctor.status, 0);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
  const explain = invoke(['explain', 'UNSUPPORTED_FORMAT']);
  assert.equal(explain.status, 0);
  assert.match(JSON.parse(explain.stdout).action, /PDF\/OCR is not implemented/);
});

test('unknown CLI command fails with machine-readable next step', () => {
  const result = invoke(['invented-command']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'CLI_USAGE');
});

test('partially completed batch reports count; stale write cannot be blindly retried', async t => {
  const root = await mkdtemp(join(tmpdir(), 'visa-dx-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const departure = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const file = join(root, 'requests.jsonl');
  await writeFile(file, [
    {action: 'intake', expectedRevision: 0, input: {...SAMPLE_INTAKE, plannedDepartureDate: departure}},
    {action: 'judge_type', expectedRevision: 0},
  ].map(r => JSON.stringify(r)).join('\n'));
  const result = invoke(['batch', root, file]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.completedRequests, 1);
  assert.equal(failure.error.code, 'REVISION_CONFLICT');
  assert.equal(failure.error.retryable, false);
});
