import { mkdir, readFile, writeFile, rename, unlink, open, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execute, initialState, fingerprint, PROMPT_VERSION, TOOL_CONTRACT_VERSION, type Request, type Principal, type CaseState, type Result, type DocumentInput } from './engine.ts';
import { DEMO_RULE_PACK, validateRulePack, type RulePack } from './rules.ts';

export interface Trace {
  schemaVersion: 1; request: Request; principal: Principal; today: string;
  ruleVersion: string; ruleHash: string; promptVersion: string; toolContractVersion: string;
  before: CaseState; document?: DocumentInput; success: boolean; error?: string; afterHash?: string;
  evidenceRefs?: unknown; approvalStatus?: string; toolCall: {name: 'visa_workflow'; arguments: Request}; modelInput: string | null;
}
/** Resolve real paths, blocking both ../ traversal and symlink escape. */
export async function confinedFile(root: string, file: string): Promise<string> {
  if (isAbsolute(file)) throw new Error('PATH_FORBIDDEN: relative files only');
  const base = await realpath(root);
  const target = await realpath(resolve(base, file));
  const rel = relative(base, target);
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('PATH_FORBIDDEN: outside case directory');
  if (!(await lstat(target)).isFile()) throw new Error('DOCUMENT_INVALID: regular file required');
  return target;
}
export async function loadPack(root: string, today: string): Promise<RulePack> {
  let pack: RulePack;
  try { pack = JSON.parse(await readFile(await confinedFile(root, 'visa-rule-pack.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; pack = DEMO_RULE_PACK; }
  validateRulePack(pack, today);
  return pack;
}
export async function loadState(root: string, pack: RulePack): Promise<CaseState> {
  try {
    const state = JSON.parse(await readFile(await confinedFile(root, 'visaflow-case.json'), 'utf8'));
    if (state.schemaVersion !== 1 || !Number.isInteger(state.revision) || state.revision < 0 || !Array.isArray(state.materials) || !Array.isArray(state.evidence) || !Array.isArray(state.checklist) || !state.approval || !state.rulePack) throw new Error('STATE_INVALID');
    return state;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return initialState(pack); }
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), {flag: 'wx', mode: 0o600});
  try { await rename(temp, path); } finally { await unlink(temp).catch(() => {}); }
}
/** Single local operator trust boundary. The MCP adapter always supplies agent, never user args. */
export async function runCase(root: string, request: Request, principal: Principal, today = new Date().toISOString().slice(0, 10)): Promise<Result> {
  if (request.action === 'read') {
    const pack = await loadPack(root, today);
    return execute(await loadState(root, pack), request, principal, pack, today);
  }
  await mkdir(root, {recursive: true});
  const base = await realpath(root);
  const lock = resolve(base, '.visaflow.lock');
  const handle = await open(lock, 'wx', 0o600).catch(() => { throw new Error('CASE_BUSY: another case operation holds the lock'); });
  try {
    const pack = await loadPack(base, today);
    const before = await loadState(base, pack);
    let document: DocumentInput | undefined;
    const trace: Trace = {schemaVersion: 1, request, principal, today, before,
      ruleVersion: pack.version, ruleHash: fingerprint(pack), promptVersion: PROMPT_VERSION, toolContractVersion: TOOL_CONTRACT_VERSION,
      success: false, toolCall: {name: 'visa_workflow', arguments: request}, modelInput: request.modelInput ?? null};
    let result: Result | undefined;
    try {
      if (['verify', 'fill_template', 'approve'].includes(request.action)) {
        for (const material of before.materials) {
          const path = await confinedFile(base, material.file);
          if ((await lstat(path)).size > 1024 * 1024 || fingerprint(await readFile(path, 'utf8')) !== material.hash) throw new Error('MATERIAL_CHANGED: parse updated source again');
        }
      }
      if (request.action === 'parse_material') {
        if (typeof request.input?.file !== 'string') throw new Error('DOCUMENT_REQUIRED');
        const path = await confinedFile(base, request.input.file);
        const size = (await lstat(path)).size;
        if (size > 1024 * 1024) throw new Error('DOCUMENT_TOO_LARGE');
        document = {file: request.input.file, content: await readFile(path, 'utf8')};
        trace.document = document;
      }
      result = execute(before, request, principal, pack, today, document);
      trace.success = true; trace.afterHash = fingerprint(result.state);
      trace.evidenceRefs = result.output.evidenceRefs; trace.approvalStatus = result.state.approval.status;
    } catch (error) { trace.error = (error as Error).message; }
    // Write a separate trace per call, avoiding JSONL/state partial interleaving.
    const traces = resolve(base, 'visa-traces');
    await mkdir(traces, {recursive: true});
    if ((await realpath(traces)) !== traces) throw new Error('PATH_FORBIDDEN: trace directory symlink');
    await atomicJson(resolve(traces, `${before.revision}-${randomUUID()}.json`), trace);
    if (!result) throw new Error(trace.error);
    await atomicJson(resolve(base, 'visaflow-case.json'), result.state);
    return result;
  } finally { await handle.close(); await unlink(lock); }
}
/** Pure replay: no state mutation, file writes or external tools. Captured bytes are used. */
export function replayTrace(trace: Trace, pack: RulePack = DEMO_RULE_PACK): {pass: boolean; reason?: string} {
  if (trace.ruleHash !== fingerprint(pack) || trace.ruleVersion !== pack.version || trace.promptVersion !== PROMPT_VERSION || trace.toolContractVersion !== TOOL_CONTRACT_VERSION) return {pass: false, reason: 'VERSION_DRIFT: rerun evaluation with new baseline'};
  let result: Result;
  try { result = execute(trace.before, trace.request, trace.principal, pack, trace.today, trace.document); }
  catch (error) {
    const reason = (error as Error).message;
    return trace.success ? {pass: false, reason} : {pass: trace.error === reason, reason: trace.error === reason ? undefined : 'ERROR_DRIFT'};
  }
  return {pass: trace.success && fingerprint(result.state) === trace.afterHash, reason: !trace.success ? 'EXPECTED_REJECTION' : fingerprint(result.state) !== trace.afterHash ? 'STATE_DRIFT' : undefined};
}
