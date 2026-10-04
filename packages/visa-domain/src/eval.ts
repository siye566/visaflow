/** Deterministic tool/workflow evaluation; not an LLM accuracy benchmark. */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demo } from './demo.ts';
import { execute, PROMPT_VERSION, TOOL_CONTRACT_VERSION } from './engine.ts';
import { replayTrace, type Trace } from './store.ts';

const variants = ['normal', 'missing', 'expired', 'name-conflict', 'passport-conflict', 'date-conflict', 'birth-conflict', 'invalid-date', 'ambiguous'];
const results: {sample: string; pass: boolean; status: string; replayed: number; replayFailures: number}[] = [];
for (const sample of variants) {
  const root = await mkdtemp(join(tmpdir(), 'visa-eval-'));
  try {
    const result = await demo(root, sample);
    const expected = sample === 'normal' ? 'pass' : sample === 'ambiguous' ? 'undetermined' : 'blocked';
    const status = result.state.verification?.status ?? result.state.visaType!.status;
    const files = await readdir(join(root, 'visa-traces')); let replayFailures = 0;
    for (const file of files) {
      const trace: Trace = JSON.parse(await readFile(join(root, 'visa-traces', file), 'utf8'));
      if (!replayTrace(trace).pass) replayFailures++;
    }
    results.push({sample, status, pass: status === expected && replayFailures === 0, replayed: files.length, replayFailures});
    if (sample === 'normal') {
      let denied = false;
      try { execute(result.state, {action: 'approve', expectedRevision: result.state.revision, input: {role: 'reviewer'}}, {role: 'agent', name: 'model'}); }
      catch (error) { denied = (error as Error).message.startsWith('APPROVAL_FORBIDDEN'); }
      results.push({sample: 'unauthorized-approval', status: denied ? 'denied' : 'allowed', pass: denied, replayed: 0, replayFailures: 0});
    }
  } finally {await rm(root, {recursive: true, force: true});}
}
const report = {scope: 'Synthetic deterministic workflow evaluation, not model quality or production performance',
  fixtureDate: '2026-10-04', promptVersion: PROMPT_VERSION, toolContractVersion: TOOL_CONTRACT_VERSION,
  total: results.length, passed: results.filter(r => r.pass).length,
  replayed: results.reduce((sum, r) => sum + r.replayed, 0), results};
console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
if (report.passed !== report.total) process.exitCode = 1;
