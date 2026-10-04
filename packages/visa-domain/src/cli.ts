import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { demo } from './demo.ts';
import { runCase, replayTrace, loadPack, type Trace } from './store.ts';
import type { Request, Principal } from './engine.ts';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'demo') {
    const root = await mkdtemp(join(tmpdir(), 'visaflow-demo-'));
    const result = await demo(root, args[0]);
    console.log(JSON.stringify({caseDirectory: root, ...result}, null, 2));
  } else if (command === 'call' || command === 'batch') {
    const [directory, inputFile, role = 'agent', name = 'local-operator'] = args;
    if (!directory || !inputFile || !['agent', 'applicant', 'reviewer'].includes(role)) throw new Error('Usage: call|batch <case-dir> <request.json|requests.jsonl> [agent|applicant|reviewer] [operator-name]');
    const source = await readFile(resolve(inputFile), 'utf8');
    const requests: Request[] = command === 'batch' ? source.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [JSON.parse(source)];
    const principal = {role, name} as Principal;
    for (const request of requests) console.log(JSON.stringify(await runCase(resolve(directory), request, principal)));
  } else if (command === 'replay') {
    if (!args[0]) throw new Error('Usage: replay <case-dir>');
    const root = resolve(args[0]);
    const pack = await loadPack(root, new Date().toISOString().slice(0, 10));
    const files = (await readdir(join(root, 'visa-traces'))).filter(file => file.endsWith('.json'));
    if (!files.length) throw new Error('NO_TRACES');
    let failed = 0;
    for (const file of files) {
      const trace: Trace = JSON.parse(await readFile(join(root, 'visa-traces', file), 'utf8'));
      const result = replayTrace(trace, pack); if (!result.pass) failed++;
      console.log(JSON.stringify({file, ...result}));
    }
    console.log(JSON.stringify({total: files.length, failed}));
    if (failed) process.exitCode = 1;
  } else {
    console.log('VisaFlow CLI: demo [normal|missing|expired|name-conflict|passport-conflict|date-conflict|birth-conflict|invalid-date|ambiguous]\ncall <case-dir> <request.json> [agent|applicant|reviewer] [operator-name]\nbatch <case-dir> <requests.jsonl> [role] [operator-name]\nreplay <case-dir>\nLocal roles are operator assertions, not multi-user authentication. Trace files contain document data; keep private.');
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
