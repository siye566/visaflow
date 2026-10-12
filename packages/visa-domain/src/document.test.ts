import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { extractDocument, fieldsFromExtraction, MAX_DOCUMENT_BYTES, sourceHash } from './document.ts';
import { textPdf, scanImage, scannedPdf, LABELLED_LINES } from './test-fixtures.ts';
import { runCase, replayTrace, type Trace } from './store.ts';
import { demo } from './demo.ts';
import { handleVisaWorkflow } from '../../session-tools-core/src/handlers/visa-workflow.ts';
import type { SessionToolContext } from '../../session-tools-core/src/context.ts';
const agent = {role: 'agent' as const, name: 'test-agent'};
const reviewer = {role: 'reviewer' as const, name: 'local-reviewer'};
const today = '2026-10-04';
async function temporary(t: {after: (fn: () => Promise<void>) => void}) {
  const root = await mkdtemp(join(tmpdir(), 'visa-pdf-test-'));
  t.after(() => rm(root, {recursive:true,force:true})); return root;
}

test('actual multi-page PDF text extraction records native coordinates and byte hash', async () => {
  const bytes = await textPdf([LABELLED_LINES.slice(0,2), LABELLED_LINES.slice(2)]);
  const document = await extractDocument('passport.PDF', bytes);
  const fields = fieldsFromExtraction(document.extraction!);
  assert.equal(document.sourceHash, sourceHash(bytes));
  assert.equal(document.extraction!.requiresReview, false);
  assert.equal(document.extraction!.pages.length, 2);
  assert.equal(fields.find(f=>f.name==='passportNumber')!.value, 'E00000001');
  assert.match(fields.find(f=>f.name==='birthDate')!.location, /^page:2\/line:/);
  assert.ok(fields.every(f=>f.bbox!.every(Number.isFinite) && f.method==='pdf-text'));
});
test('actual scanned and mixed PDF pages undergo OCR even with a text overlay', async () => {
  const document = await extractDocument('mixed.pdf', await scannedPdf(true));
  assert.deepEqual(document.extraction!.pages.map(p=>p.method), ['pdf-text','ocr']);
  assert.equal(fieldsFromExtraction(document.extraction!).find(f=>f.name==='expiryDate')!.value, '2030-12-31');
  assert.ok(document.extraction!.warnings.includes('OCR_REVIEW_REQUIRED'));
});
test('actual PNG and JPEG OCR preserve values, bounding boxes and confidence', async () => {
  for (const extension of ['png','jpeg'] as const) {
    const document = await extractDocument(`passport.${extension}`, scanImage(LABELLED_LINES, extension));
    const fields = fieldsFromExtraction(document.extraction!);
    assert.equal(fields.length,5); assert.equal(fields[0]!.value,'LIN DEMO');
    assert.equal(fields.find(f=>f.name==='passportNumber')!.value,'E00000001');
    assert.ok(fields.every(f=>f.confidence!>=0 && f.confidence!<=100 && f.bbox!.length===4));
  }
});
test('actual simplified Chinese label OCR maps fields without value guessing', async () => {
  const document = await extractDocument('chinese.png', scanImage(['姓名: LIN DEMO','护照号码: E00000001','出生日期: 1990-01-01','到期日期: 2030-12-31','出发日期: 2026-12-01']));
  const fields = fieldsFromExtraction(document.extraction!);
  const passport = fields.find(f=>f.name==='passportNumber')!;
  assert.ok(passport);
  assert.equal(passport.value, passport.sourceText!.split(/[:：]/)[1]!.trim(), 'OCR characters are preserved for human review');
  assert.equal(fields.find(f=>f.name==='birthDate')?.value,'1990-01-01');
  assert.equal(fields.find(f=>f.name==='expiryDate')?.value,'2030-12-31');
});
test('PDF text integrates with MCP verification and replay; binary edits invalidate pass', async t => {
  const root = await temporary(t); const before = await demo(root);
  await writeFile(join(root,'passport.pdf'), await textPdf());
  const ctx = {sessionPath:root,sessionId:'pdf-session'} as SessionToolContext;
  const response = await handleVisaWorkflow(ctx,{action:'parse_material',expectedRevision:before.state.revision,input:{kind:'passport',file:'passport.pdf',fields:{name:'INJECTED'}}});
  assert.equal(response.isError,false);
  const parsed = JSON.parse(response.content[0]!.type==='text'?response.content[0]!.text:'{}');
  assert.equal(parsed.state.materials.find((m: {kind:string})=>m.kind==='passport').fields[0].value,'LIN DEMO');
  const verified = await runCase(root,{action:'verify',expectedRevision:parsed.state.revision},agent,today);
  assert.equal(verified.state.verification!.status,'pass');
  for (const file of await readdir(join(root,'visa-traces'))) {
    const trace: Trace = JSON.parse(await readFile(join(root,'visa-traces',file),'utf8'));
    assert.equal(replayTrace(trace).pass,true,file);
  }
  await writeFile(join(root,'passport.pdf'), await textPdf([LABELLED_LINES.map(l=>l.replace('E00000001','E00000002'))]));
  await assert.rejects(runCase(root,{action:'fill_template',expectedRevision:verified.state.revision},agent,today), /MATERIAL_CHANGED/);
});
test('scanned PDF cannot pass before trusted review; actual CLI confirms captured source hash', async t => {
  const root = await temporary(t); let result = await demo(root);
  await writeFile(join(root,'passport.pdf'), await scannedPdf());
  result = await runCase(root,{action:'parse_material',expectedRevision:result.state.revision,input:{kind:'passport',file:'passport.pdf',reviewed:true,sourceHash:'fake'}},agent,today);
  const hash = result.state.materials.find(m=>m.kind==='passport')!.hash;
  result = await runCase(root,{action:'verify',expectedRevision:result.state.revision},agent,today);
  assert.equal(result.state.verification!.status,'blocked');
  assert.ok(result.state.verification!.findings.includes('passport:OCR_REVIEW_REQUIRED'));
  await assert.rejects(runCase(root,{action:'review_material',expectedRevision:result.state.revision,input:{kind:'passport',sourceHash:hash,confirmed:true}},agent,today),/REVIEW_FORBIDDEN/);
  await assert.rejects(runCase(root,{action:'review_material',expectedRevision:result.state.revision,input:{kind:'passport',sourceHash:'fake',confirmed:true}},reviewer,today),/REVIEW_SOURCE_MISMATCH/);
  const request = join(root,'review.json');
  await writeFile(request,JSON.stringify({action:'review_material',expectedRevision:result.state.revision,input:{kind:'passport',sourceHash:hash,confirmed:true}}));
  const cli = fileURLToPath(new URL('./cli.ts',import.meta.url));
  const reviewed = JSON.parse(execFileSync(process.execPath,['--experimental-strip-types',cli,'call',root,request,'reviewer','local-reviewer'],{encoding:'utf8'}));
  result = await runCase(root,{action:'verify',expectedRevision:reviewed.state.revision},agent,today);
  assert.equal(result.state.verification!.status,'pass');
  result = await runCase(root,{action:'parse_material',expectedRevision:result.state.revision,input:{kind:'passport',file:'passport.pdf'}},agent,today);
  assert.equal(result.state.materials.find(m=>m.kind==='passport')!.review,undefined);
});
test('OCR review does not bypass expired or conflicting fields', async t => {
  const root = await temporary(t); let result = await demo(root);
  await writeFile(join(root,'passport.png'),scanImage(LABELLED_LINES.map(l=>l.replace('2030-12-31','2025-12-31').replace('E00000001','E00000002'))));
  result = await runCase(root,{action:'parse_material',expectedRevision:result.state.revision,input:{kind:'passport',file:'passport.png'}},agent,today);
  result = await runCase(root,{action:'review_material',expectedRevision:result.state.revision,input:{kind:'passport',sourceHash:result.state.materials.find(m=>m.kind==='passport')!.hash,confirmed:true}},reviewer,today);
  result = await runCase(root,{action:'verify',expectedRevision:result.state.revision},agent,today);
  assert.equal(result.state.verification!.status,'blocked');
  assert.ok(result.state.verification!.findings.some(f=>f.includes('expiryDate')));
  assert.ok(result.state.verification!.findings.includes('cross-file:passportNumber'));
});
test('duplicate conflicting PDF labels and missing labelled fields fail closed', async () => {
  const duplicate = await extractDocument('conflict.pdf', await textPdf([['Name: LIN DEMO','Name: OTHER DEMO']]));
  assert.throws(()=>fieldsFromExtraction(duplicate.extraction!),/DOCUMENT_AMBIGUOUS/);
  const unlabelled = await extractDocument('unknown.pdf', await textPdf([['Unstructured text'] ]));
  assert.throws(()=>fieldsFromExtraction(unlabelled.extraction!),/DOCUMENT_FIELDS_NOT_FOUND/);
});
test('file signatures, byte/page/pixel limits and missing OCR models reject explicitly', async () => {
  await assert.rejects(extractDocument('fake.pdf',Buffer.from('not a PDF')),/DOCUMENT_INVALID/);
  await assert.rejects(extractDocument('large.pdf',Buffer.alloc(MAX_DOCUMENT_BYTES+1)),/DOCUMENT_TOO_LARGE/);
  await assert.rejects(extractDocument('many.pdf',await textPdf(Array.from({length:21},()=>LABELLED_LINES))),/DOCUMENT_PAGE_LIMIT/);
  const huge = scanImage(); huge.writeUInt32BE(6000,16); huge.writeUInt32BE(4000,20);
  await assert.rejects(extractDocument('oversized.png',huge),/DOCUMENT_DIMENSIONS_EXCEEDED/);
  const previous = process.env.VISAFLOW_OCR_DATA_DIR;
  process.env.VISAFLOW_OCR_DATA_DIR = join(tmpdir(),'visaflow-no-models-nonexistent');
  try { await assert.rejects(extractDocument('scan.png',scanImage()),/OCR_MODELS_MISSING/); }
  finally { if(previous===undefined) delete process.env.VISAFLOW_OCR_DATA_DIR; else process.env.VISAFLOW_OCR_DATA_DIR=previous; }
});
test('empty image fails instead of creating fields; OCR model hash mismatch is explicit', async t => {
  const canvas = createCanvas(400,400); const ctx=canvas.getContext('2d'); ctx.fillStyle='white';ctx.fillRect(0,0,400,400);
  await assert.rejects(extractDocument('blank.png',canvas.toBuffer('image/png')),/DOCUMENT_NO_TEXT/);
  const root = await temporary(t); const previous=process.env.VISAFLOW_OCR_DATA_DIR;
  await writeFile(join(root,'eng.traineddata'),'corrupt model');process.env.VISAFLOW_OCR_DATA_DIR=root;
  try {await assert.rejects(extractDocument('scan.png',scanImage()),/OCR_MODEL_HASH_MISMATCH/);}
  finally {if(previous===undefined) delete process.env.VISAFLOW_OCR_DATA_DIR;else process.env.VISAFLOW_OCR_DATA_DIR=previous;}
});
test('password-protected PDF is rejected with a dedicated error', async () => {
  // Locally generated encrypted blank PDF; password is fixture-only-password.
  const encrypted = Buffer.from('JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDNiM2ZhZThiZGM+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAyCi9SIDMKL0xlbmd0aCAxMjgKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MDA2MTNkMDNlNzI0NTc2ZDVhY2IxYjg1ZjhjNmQ5ZDdhMzNmZDY0MDEyM2FjNTRmMzEyY2E1NDc4MzZjYzJiZD4KL1UgPGQzMGE0MDUxOTA0NGM5ZDZhZDdhZDMzNWI5MTIyNWQ0MjhiZjRlNWU0ZTc1OGE0MTY0MDA0ZTU2ZmZmYTAxMDg+Cj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTE4IDAwMDAwIG4gCjAwMDAwMDAxNjcgMDAwMDAgbiAKMDAwMDAwMDI2MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKL0lEIFsgPDM1NjEzMTMyNjIzNzY0MzczODM1NjEzNjY0MzUzNTM3MzUzNjM5NjI2MjM3MzA2NDMyMzQzMjMyNjEzNzMwMzk+IDwzNTYxMzEzMjYyMzc2NDM3MzgzNTYxMzY2NDM1MzUzNzM1MzYzOTYyNjIzNzMwNjQzMjM0MzIzMjYxMzczMDM5PiBdCi9FbmNyeXB0IDUgMCBSCj4+CnN0YXJ0eHJlZgo0NzYKJSVFT0YK','base64');
  await assert.rejects(extractDocument('protected.pdf',encrypted),/DOCUMENT_ENCRYPTED/);
});
