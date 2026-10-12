/** Reproducible synthetic demonstration; never use its simulated review for customer files. */
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {demo} from '../src/demo.ts';
import {textPdf,scannedPdf,scanImage} from '../src/test-fixtures.ts';
import {runCase,replayTrace,type Trace} from '../src/store.ts';
import type {Material} from '../src/engine.ts';
const root=await mkdtemp(join(tmpdir(),'visaflow-pdf-ocr-demo-'));
let result=await demo(root);
const agent={role:'agent' as const,name:'synthetic-demo-agent'};
const snapshots: {sample:string;status:string;methods:string[];findings:string[];fields:Material['fields'];review:string;sourceHash:string}[]=[];
for(const [file,bytes] of [['passport-text.pdf',await textPdf()],['passport-scan.pdf',await scannedPdf()],['passport.png',scanImage()],['passport.jpg',scanImage(undefined,'jpeg')]] as const) {
  await writeFile(join(root,file),bytes);
  result=await runCase(root,{action:'parse_material',expectedRevision:result.state.revision,input:{kind:'passport',file}},agent,'2026-10-04');
  result=await runCase(root,{action:'verify',expectedRevision:result.state.revision},agent,'2026-10-04');
  const capture=(sample:string) => {
    const material=result.state.materials.find(m=>m.kind==='passport')!;
    snapshots.push({sample,status:result.state.verification!.status,methods:material.extraction!.pages.map(p=>p.method),findings:result.state.verification!.findings,
      fields:material.fields,review:material.review ? 'simulated local reviewer (synthetic only)' : material.extraction!.requiresReview ? 'required' : 'not required',sourceHash:material.hash});
  };
  capture(file);
  const material=result.state.materials.find(m=>m.kind==='passport')!;
  if(material.extraction!.requiresReview) {
    result=await runCase(root,{action:'review_material',expectedRevision:result.state.revision,input:{kind:'passport',sourceHash:material.hash,confirmed:true}},
      {role:'reviewer',name:'synthetic-fixture-reviewer'},'2026-10-04');
    result=await runCase(root,{action:'verify',expectedRevision:result.state.revision},agent,'2026-10-04');
    capture(`${file} after simulated review`);
  }
}
let replayed=0;
for(const file of await readdir(join(root,'visa-traces'))) {
  const trace:Trace=JSON.parse(await readFile(join(root,'visa-traces',file),'utf8'));
  if(!replayTrace(trace).pass) throw new Error(`REPLAY_FAILED: ${file}`); replayed++;
}
const report={scope:'Actual local PDF/OCR runs on synthetic labelled materials; simulated human review; no model calls or production accuracy claim',fixtureDate:'2026-10-04',replayed,snapshots};
if(process.argv[2]) await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({caseDirectory:root,...report},null,2));
