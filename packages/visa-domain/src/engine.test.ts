import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, initialState, allowedActions, type Principal } from './engine.ts';
import { DEMO_RULE_PACK } from './rules.ts';
import { runCase, replayTrace, confinedFile, type Trace } from './store.ts';
import { demo, SAMPLE_INTAKE, SAMPLE_FIELDS } from './demo.ts';

const agent: Principal = {role: 'agent', name: 'agent'};
const applicant: Principal = {role: 'applicant', name: 'local-applicant'};
const reviewer: Principal = {role: 'reviewer', name: 'local-reviewer'};
async function temp(t: {after: (fn: () => Promise<void>) => void}) {
  const root = await mkdtemp(join(tmpdir(), 'visa-test-')); t.after(() => rm(root, {recursive: true, force: true})); return root;
}
test('normal documents: coverage, cited locations, template and reviewer approval', async t => {
  const root = await temp(t); const result = await demo(root);
  assert.equal(result.state.verification?.status, 'pass');
  assert.deepEqual(result.output.coverage, {required: 2, verified: 2});
  assert.ok(result.state.evidence.every(e => e.id.includes('@1.0.0')));
  assert.equal(result.state.materials[0]!.fields[0]!.location, '$.name');
  const template = await runCase(root, {action: 'fill_template', expectedRevision: result.state.revision}, agent, '2026-10-04');
  assert.match(String(template.output.text), /LIN DEMO/);
  const approved = await runCase(root, {action: 'approve', expectedRevision: template.state.revision}, reviewer, '2026-10-04');
  assert.equal(approved.state.approval.by, 'local-reviewer');
});
for (const [variant, finding] of [['missing', 'missing:application'], ['expired', 'expiryDate'], ['name-conflict', 'cross-file:name'], ['passport-conflict', 'cross-file:passportNumber'], ['date-conflict', 'cross-file:departureDate'], ['birth-conflict', 'cross-file:birthDate'], ['invalid-date', 'invalid calendar date']]) {
  test(`blocks ${variant} and preserves material evidence`, async t => {
    const result = await demo(await temp(t), variant);
    assert.equal(result.state.stage, 'remediation'); assert.equal(result.state.verification?.status, 'blocked');
    assert.ok(result.state.verification!.findings.some(f => f.includes(finding!)));
    assert.ok(!result.allowedActions.includes('fill_template'));
  });
}
test('ambiguous purpose stays undetermined; no generated checklist', async t => {
  const result = await demo(await temp(t), 'ambiguous');
  assert.equal(result.state.visaType?.status, 'undetermined'); assert.equal(result.state.checklist.length, 0);
  assert.throws(() => execute(result.state, {action: 'confirm_type', expectedRevision: result.state.revision, input: {code: 'DEMO-BUSINESS'}}, applicant), /TYPE_UNCONFIRMED/);
});
test('clarification restarts type judgment and removes obsolete candidate evidence', async t => {
  const result = await demo(await temp(t), 'ambiguous');
  const clarified = execute(result.state, {action: 'intake', expectedRevision: result.state.revision, input: SAMPLE_INTAKE}, agent);
  assert.equal(clarified.state.evidence.length, 0);
  assert.equal(clarified.state.visaType, undefined);
  const judged = execute(clarified.state, {action: 'judge_type', expectedRevision: clarified.state.revision}, agent);
  assert.equal(judged.state.visaType?.code, 'DEMO-BUSINESS');
});
test('visa type clips checklist and accepted material kinds', () => {
  let state = execute(initialState(), {action: 'intake', expectedRevision: 0, input: {...SAMPLE_INTAKE, travelPurpose: 'visit'}}, agent).state;
  state = execute(state, {action: 'judge_type', expectedRevision: 1}, agent).state;
  state = execute(state, {action: 'confirm_type', expectedRevision: 2, input: {code: 'DEMO-VISIT'}}, applicant).state;
  state = execute(state, {action: 'checklist', expectedRevision: 3}, agent).state;
  assert.equal(state.checklist.length, 2);
  assert.ok(!state.checklist.some(c => c.id === 'invitation'));
  assert.throws(() => execute(state, {action: 'parse_material', expectedRevision: 4, input: {kind: 'invitation'}}, agent, DEMO_RULE_PACK, '2026-10-04', {file: 'invitation.txt', content: 'name: LIN DEMO'}), /DOCUMENT_REQUIRED/);
});
test('stage gate and optimistic revision reject skipped and stale calls', () => {
  assert.throws(() => execute(initialState(), {action: 'checklist', expectedRevision: 0}, agent), /STAGE_FORBIDDEN/);
  assert.throws(() => execute(initialState(), {action: 'intake', expectedRevision: 10, input: SAMPLE_INTAKE}, agent), /REVISION_CONFLICT/);
});
test('model cannot confirm type or approve, even when role is injected in input', async t => {
  const root = await temp(t); const result = await demo(root);
  assert.throws(() => execute(result.state, {action: 'approve', expectedRevision: result.state.revision, input: {role: 'reviewer', approved: true}}, agent), /APPROVAL_FORBIDDEN/);
  const intake = execute(initialState(), {action: 'intake', expectedRevision: 0, input: SAMPLE_INTAKE}, agent);
  const inferred = execute(intake.state, {action: 'judge_type', expectedRevision: 1}, agent);
  assert.ok(!allowedActions(inferred.state, agent).includes('confirm_type'));
  assert.throws(() => execute(inferred.state, {action: 'confirm_type', expectedRevision: 2, input: {code: 'DEMO-BUSINESS'}}, agent), /CONFIRMATION_REQUIRED/);
});
test('correction reruns checks; any upload invalidates prior pass and approval', async t => {
  const root = await temp(t); let result = await demo(root, 'name-conflict');
  await writeFile(join(root, 'application.json'), JSON.stringify(SAMPLE_FIELDS));
  result = await runCase(root, {action: 'parse_material', expectedRevision: result.state.revision, input: {kind: 'application', file: 'application.json'}}, agent, '2026-10-04');
  result = await runCase(root, {action: 'verify', expectedRevision: result.state.revision}, agent, '2026-10-04');
  assert.equal(result.state.verification?.status, 'pass'); assert.equal(result.state.conflicts.length, 0);
  result = await runCase(root, {action: 'approve', expectedRevision: result.state.revision}, reviewer, '2026-10-04');
  result = await runCase(root, {action: 'parse_material', expectedRevision: result.state.revision, input: {kind: 'application', file: 'application.json'}}, agent, '2026-10-04');
  assert.equal(result.state.verification, undefined); assert.equal(result.state.approval.status, 'pending');
});
test('source edits cannot leave a stale passing conclusion', async t => {
  const root = await temp(t); const result = await demo(root);
  await writeFile(join(root, 'passport.json'), JSON.stringify({...SAMPLE_FIELDS, expiryDate: '2026-01-01'}));
  await assert.rejects(runCase(root, {action: 'approve', expectedRevision: result.state.revision}, reviewer, '2026-10-04'), /MATERIAL_CHANGED/);
});
test('all captured engine calls replay; rule/prompt/contract drift is detected', async t => {
  const root = await temp(t); const result = await demo(root);
  await assert.rejects(runCase(root, {action: 'approve', expectedRevision: result.state.revision}, agent, '2026-10-04'), /APPROVAL_FORBIDDEN/);
  const files = await readdir(join(root, 'visa-traces'));
  assert.equal(files.length, 8);
  for (const file of files) {
    const trace: Trace = JSON.parse(await readFile(join(root, 'visa-traces', file), 'utf8'));
    assert.equal(replayTrace(trace).pass, true, file);
    assert.equal(trace.modelInput, null);
    assert.equal(replayTrace({...trace, promptVersion: 'new'}).pass, false);
    assert.equal(replayTrace({...trace, toolContractVersion: 'new'}).pass, false);
    assert.equal(replayTrace(trace, {...DEMO_RULE_PACK, version: '1.0.1'}).pass, false);
  }
});
test('path traversal and symlink escape cannot access external document', async t => {
  const root = await temp(t); const outside = await temp(t);
  await writeFile(join(outside, 'private.json'), '{}');
  await assert.rejects(confinedFile(root, join('..', outside.split(/[\\/]/).pop()!, 'private.json')), /PATH_FORBIDDEN/);
  await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(confinedFile(root, 'link/private.json'), /PATH_FORBIDDEN/);
});
test('unsupported PDF is rejected; no invented OCR evidence', async t => {
  const root = await temp(t); const result = await demo(root);
  await writeFile(join(root, 'scan.pdf'), '%PDF-1.7 fake bytes');
  await assert.rejects(runCase(root, {action: 'parse_material', expectedRevision: result.state.revision, input: {kind: 'passport', file: 'scan.pdf'}}, agent, '2026-10-04'), /UNSUPPORTED_FORMAT/);
});
test('non-demo destination and future/draft/changed rules fail closed', () => {
  const intake = execute(initialState(), {action: 'intake', expectedRevision: 0, input: {...SAMPLE_INTAKE, destination: 'US'}}, agent);
  assert.equal(execute(intake.state, {action: 'judge_type', expectedRevision: 1}, agent).state.visaType?.status, 'undetermined');
  assert.throws(() => execute(initialState(), {action: 'read'}, agent, {...DEMO_RULE_PACK, reviewed: false}), /RULE_PACK_INVALID/);
  assert.throws(() => execute(initialState(), {action: 'read'}, agent, {...DEMO_RULE_PACK, effectiveDate: '2099-01-01'}), /RULE_PACK_INVALID/);
  assert.throws(() => execute(initialState(), {action: 'read'}, agent, {...DEMO_RULE_PACK, version: '1.1.0'}), /RULE_PACK_CHANGED/);
});
test('parallel mutations cannot silently overwrite a case revision', async t => {
  const root = await temp(t);
  const outcomes = await Promise.allSettled([1, 2].map(() => runCase(root, {action: 'intake', expectedRevision: 0, input: SAMPLE_INTAKE}, agent, '2026-10-04')));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
});
