/** Fictional destination and document requirements: engineering fixtures, not visa advice. */
export interface RulePack {
  id: string; version: string; effectiveDate: string; source: string; reviewed: boolean;
  scope: { destination: string; purposes: string[] };
  types: { code: string; purposes: string[]; maxStayDays: number }[];
  materials: { id: string; name: string; required: boolean; fields: string[]; expiryField?: string; minValidityDays?: number; visaTypes?: string[] }[];
  consistentFields: string[];
  fieldPatterns: Record<string, string>;
  nodes: string[]; sop: string; template: string; errorCases: string[]; isDemo: boolean;
}
export const DEMO_RULE_PACK: RulePack = {
  id: 'DEMO-ENTRY', version: '1.0.0', effectiveDate: '2026-01-01',
  source: 'repository:docs/rule-pack.md (fictional engineering fixture)', reviewed: true,
  scope: { destination: 'DEMO', purposes: ['business', 'visit'] },
  types: [ { code: 'DEMO-BUSINESS', purposes: ['business'], maxStayDays: 30 },
    { code: 'DEMO-VISIT', purposes: ['visit'], maxStayDays: 30 } ],
  materials: [
    { id: 'passport', name: '护照字段样例', required: true, fields: ['name', 'passportNumber', 'birthDate', 'expiryDate'], expiryField: 'expiryDate', minValidityDays: 90 },
    { id: 'application', name: '申请表字段样例', required: true, fields: ['name', 'passportNumber', 'birthDate', 'departureDate'] },
    { id: 'invitation', name: '商务邀请函字段样例（可选）', required: false, fields: ['name'], visaTypes: ['DEMO-BUSINESS'] },
  ],
  consistentFields: ['name', 'passportNumber', 'birthDate', 'departureDate'],
  fieldPatterns: { passportNumber: '^[A-Z][0-9]{8}$', name: '^[A-Za-z ]{2,80}$' },
  nodes: ['intake', 'type-judgment', 'checklist', 'verification', 'remediation'],
  sop: 'docs/rule-pack.md#sop',
  template: 'Material pre-review (DEMO ONLY)\nName: {{name}}\nPassport: {{passportNumber}}\nDeparture: {{departureDate}}\n',
  errorCases: ['missing-material', 'expired-passport', 'name-conflict', 'passport-conflict', 'date-conflict', 'unauthorized-approval'], isDemo: true,
};
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateRulePack(pack: RulePack, today: string): void {
  if (!pack || !pack.id || !/^\d+\.\d+\.\d+$/.test(pack.version) || !pack.source || !pack.reviewed
    || !validDate(pack.effectiveDate) || pack.effectiveDate > today
    || !pack.scope?.destination || !pack.scope.purposes?.length || !pack.types?.length
    || !pack.materials?.length || !pack.nodes?.includes('verification') || !pack.sop || !pack.template || !pack.errorCases?.length) {
    throw new Error('RULE_PACK_INVALID: reviewed, effective, complete Rule Pack required');
  }
  const unique = new Set<string>();
  for (const item of pack.materials) {
    if (!item.id || unique.has(item.id) || !item.name || typeof item.required !== 'boolean' || !Array.isArray(item.fields) || !item.fields.length
      || (item.expiryField && (!item.fields.includes(item.expiryField) || !Number.isInteger(item.minValidityDays) || item.minValidityDays! < 0))) throw new Error('RULE_PACK_INVALID: material contract');
    unique.add(item.id);
  }
  for (const t of pack.types) {
    if (!t.code || !t.purposes?.length || !Number.isInteger(t.maxStayDays) || t.maxStayDays <= 0) throw new Error('RULE_PACK_INVALID: type contract');
  }
  if (!Array.isArray(pack.consistentFields) || !pack.fieldPatterns || typeof pack.isDemo !== 'boolean') throw new Error('RULE_PACK_INVALID: field contract');
  for (const pattern of Object.values(pack.fieldPatterns)) {
    if (pattern.length > 150 || !pattern.startsWith('^') || !pattern.endsWith('$')) throw new Error('RULE_PACK_INVALID: bounded anchored pattern required');
    new RegExp(pattern);
  }
}
