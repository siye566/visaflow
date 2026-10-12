import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {demo} from '../src/demo.ts';
import {textPdf,scanImage} from '../src/test-fixtures.ts';
test('bundled CJS/Node and ESM/Bun MCP handlers load copied native PDF/OCR runtime', async () => {
  const root = await mkdtemp(join(tmpdir(),'visa-bundle-test-'));
  try {
    const result = await demo(root);
    await writeFile(join(root,'passport.pdf'),await textPdf());
    await writeFile(join(root,'passport.png'),scanImage());
    const entry = fileURLToPath(new URL('../../session-tools-core/src/handlers/visa-workflow.ts',import.meta.url));
    execFileSync('node',[fileURLToPath(new URL('./copy-runtime.mjs',import.meta.url)),root],{stdio:'inherit',timeout:60_000});
    for (const [format,target,extension,executable] of [['cjs','node','cjs','node'],['esm','bun','mjs',process.execPath]] as const) {
      const outfile = join(root,`handler.${extension}`);
      const build = await Bun.build({entrypoints:[entry],format,target,packages:'bundle'});
      expect(build.success).toBe(true); await writeFile(outfile,await build.outputs[0]!.text());
      const runner = join(root,`runner-${format}.mjs`);
      await writeFile(runner, `const module=await import(${JSON.stringify(`./handler.${extension}`)}); const handleVisaWorkflow=module.default?.handleVisaWorkflow??module.handleVisaWorkflow;\nconst root=${JSON.stringify(root)}; const ctx={sessionPath:root,sessionId:'bundled-test'}; let revision=${result.state.revision};\nfor(const file of ['passport.pdf','passport.png']) {const response=await handleVisaWorkflow(ctx,{action:'parse_material',expectedRevision:revision,input:{kind:'passport',file}}); if(response.isError) throw new Error(response.content[0].text); const parsed=JSON.parse(response.content[0].text); revision=parsed.state.revision; console.log(JSON.stringify({file,method:parsed.state.materials.find(m=>m.kind==='passport').fields[0].method}));}\n`);
      const output = execFileSync(executable,[runner],{encoding:'utf8',timeout:60_000});
      const lines = output.trim().split(/\r?\n/).map(line=>JSON.parse(line));
      expect(lines).toEqual([{file:'passport.pdf',method:'pdf-text'},{file:'passport.png',method:'ocr'}]);
      // Reset to the same pre-upload revision before testing the second bundle format.
      await writeFile(join(root,'visaflow-case.json'),JSON.stringify(result.state));
    }
  } finally {await rm(root,{recursive:true,force:true});}
},120_000);
