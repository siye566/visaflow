import { createHash } from 'node:crypto';
import { DEMO_RULE_PACK, validateRulePack, validDate, type RulePack } from './rules.ts';

export const PROMPT_VERSION = 'visaflow-2';
export const TOOL_CONTRACT_VERSION = '1.0.0';
export const ACTIONS = ['read', 'intake', 'judge_type', 'confirm_type', 'checklist', 'parse_material', 'verify', 'fill_template', 'approve'] as const;
export type Action = typeof ACTIONS[number];
export type Stage = 'intake' | 'type-judgment' | 'checklist' | 'verification' | 'remediation';
export interface Field { name: string; value: string; location: string }
export interface Material { id: string; kind: string; file: string; hash: string; fields: Field[]; issues: {field: string; message: string; severity: 'error'}[] }
export interface CaseState {
  schemaVersion: 1; revision: number; stage: Stage; isDemo: boolean;
  applicant?: {name: string; nationality: string}; destination?: string; travelPurpose?: string; plannedDepartureDate?: string; stayDays?: number;
  visaType?: {code?: string; status: 'confirmed' | 'inferred' | 'undetermined'; note?: string};
  rulePack: {id: string; version: string; effectiveDate: string; source: string; reviewStatus: 'reviewed'; hash: string};
  checklist: {id: string; name: string; required: boolean; status: 'missing' | 'uploaded' | 'verified' | 'conflict'; note?: string}[];
  materials: Material[];
  conflicts: {id: string; field: string; values: {value: string; from: string; location: string}[]; resolution: 'open'}[];
  evidence: {id: string; title: string; source: string; effectiveDate: string; snippet: string}[];
  verification?: {status: 'pass' | 'blocked'; findings: string[]; revision: number};
  approval: {status: 'pending' | 'approved'; by?: string; at?: string};
  updatedAt: number;
}
export interface Request { action: Action; expectedRevision?: number; input?: Record<string, unknown>; modelInput?: string }
export interface Principal { role: 'agent' | 'applicant' | 'reviewer'; name: string }
export interface DocumentInput {file: string; content: string}
export interface Result { state: CaseState; output: Record<string, unknown>; allowedActions: Action[] }
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function initialState(pack: RulePack = DEMO_RULE_PACK): CaseState {
  return {schemaVersion: 1, revision: 0, stage: 'intake', isDemo: pack.isDemo,
    rulePack: {id: pack.id, version: pack.version, effectiveDate: pack.effectiveDate, source: pack.source, reviewStatus: 'reviewed', hash: fingerprint(pack)},
    checklist: [], materials: [], conflicts: [], evidence: [], approval: {status: 'pending'}, updatedAt: 0};
}
export function allowedActions(state: CaseState, principal: Principal): Action[] {
  const map: Record<Stage, Action[]> = {
    intake: ['read', 'intake'], 'type-judgment': ['read', 'intake', 'judge_type', 'confirm_type'],
    checklist: ['read', 'checklist'], verification: ['read', 'parse_material', 'verify'],
    remediation: ['read', 'intake', 'parse_material', 'verify'],
  };
  const actions = [...map[state.stage]];
  if (principal.role === 'agent') {
    const confirmation = actions.indexOf('confirm_type');
    if (confirmation >= 0) actions.splice(confirmation, 1);
  }
  if (state.verification?.status === 'pass') {
    actions.push('fill_template');
    if (principal.role === 'reviewer') actions.push('approve');
  }
  return actions;
}
function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error(`INPUT_INVALID: ${name}`);
  return value.trim();
}
function evidence(state: CaseState, pack: RulePack, id: string, snippet: string): void {
  const ref = `${pack.id}@${pack.version}:${id}`;
  if (!state.evidence.some(e => e.id === ref)) state.evidence.push({id: ref, title: id, source: pack.source, effectiveDate: pack.effectiveDate, snippet});
}
/** Locations are computed from actual structured files; model-provided locations are ignored. */
export function parseDocument(document: DocumentInput): Field[] {
  if (Buffer.byteLength(document.content) > 1024 * 1024) throw new Error('DOCUMENT_TOO_LARGE');
  if (document.file.endsWith('.json')) {
    const parsed: unknown = JSON.parse(document.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('DOCUMENT_INVALID: expected flat field object');
    if (Object.keys(parsed).length === 0 || Object.keys(parsed).length > 100) throw new Error('DOCUMENT_INVALID: empty or too many fields');
    return Object.entries(parsed).map(([name, value]) => {
      if (typeof value !== 'string' || value.length > 500) throw new Error('DOCUMENT_INVALID: field must be a short string');
      return {name, value: value.trim(), location: `$.${name}`};
    });
  }
  if (!document.file.endsWith('.txt')) throw new Error('UNSUPPORTED_FORMAT: use JSON or key:value TXT; PDF/OCR adapter is not implemented');
  const fields: Field[] = [];
  document.content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
    if (!match || match[2]!.length > 500 || fields.some(f => f.name === match[1])) throw new Error(`DOCUMENT_INVALID: line ${index + 1}`);
    fields.push({name: match[1]!, value: match[2]!.trim(), location: `line:${index + 1}`});
  });
  if (!fields.length || fields.length > 100) throw new Error('DOCUMENT_INVALID: empty or too many fields');
  return fields;
}
export function execute(before: CaseState, request: Request, principal: Principal,
  pack: RulePack = DEMO_RULE_PACK, now = '2026-10-04', document?: DocumentInput): Result {
  validateRulePack(pack, now);
  if (before.schemaVersion !== 1 || before.rulePack.hash !== fingerprint(pack)) throw new Error('RULE_PACK_CHANGED: explicit new case required');
  if (!ACTIONS.includes(request.action)) throw new Error('UNKNOWN_ACTION');
  if (request.action === 'approve' && principal.role !== 'reviewer') throw new Error('APPROVAL_FORBIDDEN: trusted local reviewer required');
  if (request.action === 'confirm_type' && principal.role === 'agent') throw new Error('CONFIRMATION_REQUIRED: applicant/reviewer local confirmation');
  if (!allowedActions(before, principal).includes(request.action)) throw new Error(`STAGE_FORBIDDEN: ${request.action} at ${before.stage}`);
  if (request.action !== 'read' && request.expectedRevision !== before.revision) throw new Error('REVISION_CONFLICT: read current state before mutation');
  const state = structuredClone(before);
  const input = request.input ?? {};
  const output: Record<string, unknown> = {};
  if (request.action === 'intake') {
    state.destination = requireString(input.destination, 'destination');
    state.travelPurpose = requireString(input.travelPurpose, 'travelPurpose');
    state.plannedDepartureDate = requireString(input.plannedDepartureDate, 'plannedDepartureDate');
    state.applicant = {name: requireString(input.name, 'name'), nationality: requireString(input.nationality, 'nationality')};
    if (!validDate(state.plannedDepartureDate) || state.plannedDepartureDate < now || !Number.isInteger(input.stayDays) || Number(input.stayDays) <= 0) throw new Error('INPUT_INVALID: future departure and positive stayDays required');
    state.stayDays = Number(input.stayDays);
    state.visaType = undefined; state.checklist = []; state.materials = []; state.conflicts = [];
    state.evidence = []; state.verification = undefined; state.approval = {status: 'pending'};
    state.stage = 'type-judgment';
  } else if (request.action === 'judge_type') {
    const candidates = state.destination === pack.scope.destination && pack.scope.purposes.includes(state.travelPurpose!)
      ? pack.types.filter(t => t.purposes.includes(state.travelPurpose!) && state.stayDays! <= t.maxStayDays) : [];
    state.visaType = {status: candidates.length === 1 ? 'inferred' : 'undetermined', code: candidates.length === 1 ? candidates[0]!.code : undefined, note: candidates.length === 1 ? 'Needs applicant confirmation' : 'No unique applicable rule; request clarification'};
    output.candidates = candidates.map(t => t.code);
    evidence(state, pack, 'type-judgment', JSON.stringify(candidates));
  } else if (request.action === 'confirm_type') {
    if (state.visaType?.status !== 'inferred' || input.code !== state.visaType.code) throw new Error('TYPE_UNCONFIRMED: first obtain unique candidate');
    state.visaType.status = 'confirmed'; state.visaType.note = `Confirmed by ${principal.name}`; state.stage = 'checklist';
  } else if (request.action === 'checklist') {
    if (state.visaType?.status !== 'confirmed' || !state.evidence.length) throw new Error('EVIDENCE_REQUIRED');
    const applicable = pack.materials.filter(m => !m.visaTypes || m.visaTypes.includes(state.visaType!.code!));
    state.checklist = applicable.map(m => ({id: m.id, name: m.name, required: m.required, status: 'missing', note: `${pack.id}@${pack.version}:${m.id}`}));
    for (const m of applicable) evidence(state, pack, m.id, JSON.stringify(m));
    state.stage = 'verification';
  } else if (request.action === 'parse_material') {
    const kind = requireString(input.kind, 'kind');
    if (!state.checklist.some(m => m.id === kind) || !document) throw new Error('DOCUMENT_REQUIRED: type-specific kind and source file required');
    const material: Material = {id: kind, kind, file: document.file, hash: fingerprint(document.content), fields: parseDocument(document), issues: []};
    state.materials = state.materials.filter(m => m.kind !== kind).concat(material);
    state.checklist.find(m => m.id === kind)!.status = 'uploaded';
    // Any changed document invalidates ALL previous checks and approval. No stale pass.
    state.verification = undefined; state.approval = {status: 'pending'}; state.conflicts = [];
    for (const item of state.checklist) if (item.status === 'verified' || item.status === 'conflict') item.status = state.materials.some(m => m.kind === item.id) ? 'uploaded' : 'missing';
  } else if (request.action === 'verify') {
    const findings: string[] = [];
    state.conflicts = [];
    for (const material of state.materials) material.issues = [];
    for (const rule of pack.materials.filter(m => state.checklist.some(c => c.id === m.id))) {
      const material = state.materials.find(m => m.kind === rule.id);
      const item = state.checklist.find(m => m.id === rule.id)!;
      if (!material) { item.status = 'missing'; if (rule.required) findings.push(`missing:${rule.id}`); continue; }
      for (const field of rule.fields) {
        const value = material.fields.find(f => f.name === field)?.value;
        let problem: string | undefined;
        if (!value) problem = 'required field missing';
        else if (/Date$/.test(field) && !validDate(value)) problem = 'invalid calendar date';
        else if (pack.fieldPatterns[field] && !new RegExp(pack.fieldPatterns[field]).test(value)) problem = 'field constraint failed';
        else if (field === rule.expiryField && Date.parse(value) < Date.parse(state.plannedDepartureDate!) + (rule.minValidityDays ?? 0) * 86400000) problem = 'expired/insufficient validity';
        if (problem) { material.issues.push({field, message: problem, severity: 'error'}); findings.push(`${rule.id}:${field}:${problem}`); }
      }
      item.status = material.issues.length ? 'conflict' : 'verified';
    }
    // Include intake as a source, so a consistent but wrong pair of files cannot pass.
    const intakeFields: Record<string, string | undefined> = {name: state.applicant?.name, departureDate: state.plannedDepartureDate};
    for (const field of pack.consistentFields) {
      const values = state.materials.flatMap(m => m.fields.filter(f => f.name === field).map(f => ({value: f.value, from: m.file, location: f.location})));
      if (intakeFields[field]) values.push({value: intakeFields[field]!, from: 'intake', location: field});
      const canonical = (value: string) => field === 'name' ? value.toUpperCase().replace(/\s+/g, ' ').trim() : value;
      if (new Set(values.map(v => canonical(v.value))).size > 1) {
        state.conflicts.push({id: `conflict-${field}`, field, values, resolution: 'open'}); findings.push(`cross-file:${field}`);
        for (const m of state.materials) if (m.fields.some(f => f.name === field)) state.checklist.find(c => c.id === m.kind)!.status = 'conflict';
      }
    }
    if (!state.evidence.length || state.visaType?.status !== 'confirmed') findings.push('rule/type evidence missing');
    state.verification = {status: findings.length ? 'blocked' : 'pass', findings, revision: before.revision + 1};
    state.stage = findings.length ? 'remediation' : 'verification';
    state.approval = {status: 'pending'};
    output.coverage = {required: state.checklist.filter(c => c.required).length, verified: state.checklist.filter(c => c.required && c.status === 'verified').length};
  } else if (request.action === 'fill_template') {
    const fields = Object.fromEntries(state.materials.flatMap(m => m.fields.map(f => [f.name, f.value])));
    output.text = pack.template.replace(/\{\{([A-Za-z0-9]+)\}\}/g, (_, name: string) => {
      if (!fields[name]) throw new Error(`TEMPLATE_FIELD_MISSING: ${name}`);
      return fields[name]!.replace(/[\r\n]/g, ' ');
    });
  } else if (request.action === 'approve') {
    if (!principal.name.trim()) throw new Error('REVIEWER_ID_REQUIRED');
    state.approval = {status: 'approved', by: principal.name, at: now};
  }
  if (request.action !== 'read') { state.revision++; state.updatedAt = Date.parse(now); }
  output.verification = state.verification ?? null;
  output.approval = state.approval;
  output.evidenceRefs = state.evidence.map(e => e.id);
  output.ruleVersion = pack.version;
  output.ruleHash = state.rulePack.hash;
  output.fileLocations = state.materials.map(m => ({file: m.file, fields: m.fields.map(f => ({name: f.name, location: f.location}))}));
  output.disclaimer = pack.isDemo ? 'Fictional engineering fixture; no real visa eligibility determination.' : 'Document pre-review only; issuing authority decides.';
  return {state, output, allowedActions: allowedActions(state, principal)};
}
