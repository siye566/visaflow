import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCase } from './store.ts';
import type { Action, Principal } from './engine.ts';

export const SAMPLE_FIELDS = {name: 'LIN DEMO', passportNumber: 'E00000001', birthDate: '1998-01-02', expiryDate: '2030-12-31', departureDate: '2026-12-01'};
export const SAMPLE_INTAKE = {name: 'LIN DEMO', nationality: 'DEMO', destination: 'DEMO', travelPurpose: 'business', stayDays: 7, plannedDepartureDate: '2026-12-01'};
export async function demo(root: string, variant = 'normal') {
  await mkdir(root, {recursive: true});
  const passport = {...SAMPLE_FIELDS};
  const application = {...SAMPLE_FIELDS};
  if (variant === 'expired') passport.expiryDate = '2026-01-01';
  if (variant === 'name-conflict') application.name = 'OTHER DEMO';
  if (variant === 'passport-conflict') application.passportNumber = 'E00000002';
  if (variant === 'date-conflict') application.departureDate = '2026-12-02';
  if (variant === 'birth-conflict') application.birthDate = '1998-01-03';
  if (variant === 'invalid-date') application.birthDate = '1998-02-30';
  await writeFile(join(root, 'passport.json'), JSON.stringify(passport));
  await writeFile(join(root, 'application.json'), JSON.stringify(application));
  let revision = 0;
  const agent: Principal = {role: 'agent', name: 'demo-agent'};
  const call = async (action: Action, input: Record<string, unknown> = {}, principal = agent) => {
    const result = await runCase(root, {action, input, expectedRevision: revision}, principal, '2026-10-04');
    revision = result.state.revision; return result;
  };
  await call('intake', variant === 'ambiguous' ? {...SAMPLE_INTAKE, travelPurpose: 'unknown'} : SAMPLE_INTAKE);
  const candidate = await call('judge_type');
  if (variant === 'ambiguous') return candidate;
  await call('confirm_type', {code: 'DEMO-BUSINESS'}, {role: 'applicant', name: 'local-demo-applicant'});
  await call('checklist');
  await call('parse_material', {kind: 'passport', file: 'passport.json'});
  if (variant !== 'missing') await call('parse_material', {kind: 'application', file: 'application.json'});
  return call('verify');
}
