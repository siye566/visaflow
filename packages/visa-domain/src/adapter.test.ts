import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleVisaWorkflow, handleVisaCaseRead } from '../../session-tools-core/src/handlers/visa-workflow.ts';
import type { SessionToolContext } from '../../session-tools-core/src/context.ts';
import { demo } from './demo.ts';

test('actual MCP handler uses host session root and never accepts reviewer identity', async t => {
  const root = await mkdtemp(join(tmpdir(), 'visa-adapter-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const result = await demo(root);
  const ctx = {sessionPath: root, sessionId: 'test-session'} as SessionToolContext;
  const denied = await handleVisaWorkflow(ctx, {action: 'approve', expectedRevision: result.state.revision, input: {role: 'reviewer'}});
  assert.equal(denied.isError, true); assert.match(denied.content[0]!.type === 'text' ? denied.content[0]!.text : '', /APPROVAL_FORBIDDEN/);
  const before = (await readdir(join(root, 'visa-traces'))).length;
  const read = await handleVisaCaseRead(ctx);
  assert.equal(read.isError, false);
  assert.equal((await readdir(join(root, 'visa-traces'))).length, before, 'read-only tool must not write traces');
  const payload = JSON.parse(read.content[0]!.type === 'text' ? read.content[0]!.text : '{}');
  assert.equal(payload.state.revision, result.state.revision);
  assert.ok(!payload.allowedActions.includes('approve'));
});
test('host context without a session path fails closed', async () => {
  const response = await handleVisaCaseRead({sessionId: 'test'} as SessionToolContext);
  assert.equal(response.isError, true);
});
