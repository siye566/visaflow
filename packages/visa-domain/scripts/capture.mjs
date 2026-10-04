// Render actual CLI stdout in a documentation viewer. This is not the Electron UI.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = join(root, 'docs/screenshots'); mkdirSync(output, {recursive: true});
const runs = ['normal', 'name-conflict', 'expired'].map(variant => {
  const run = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', join(root, 'packages/visa-domain/src/cli.ts'), 'demo', variant], {encoding: 'utf8'}));
  const casePath = resolve(run.caseDirectory);
  if (dirname(casePath).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(casePath).startsWith('visaflow-demo-')) throw new Error('Unexpected temporary case path');
  rmSync(casePath, {recursive: true, force: true});
  return {variant, ...run};
});
const report = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', join(root, 'packages/visa-domain/src/eval.ts')], {encoding: 'utf8'}));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const style = `<style>*{box-sizing:border-box}body{margin:0;padding:42px;background:#f3f6fb;color:#17263b;font-family:"Microsoft YaHei",sans-serif}header{display:flex;justify-content:space-between;align-items:center}small{color:#355fd5;letter-spacing:2px;font-weight:700}h1{font-size:34px;margin:14px 0}p{color:#637185;font-size:16px;line-height:1.8}.badge{background:#e6edff;color:#355fd5;padding:9px 16px;border-radius:22px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:24px 0}article{background:white;border:1px solid #dce4f0;border-radius:18px;padding:24px}h2{font-size:20px;margin:0 0 16px}pre{background:#f5f7fb;border-radius:10px;padding:16px;font:13px/1.8 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.pass{color:#148068}.blocked{color:#bd5847}footer{color:#68778f;font-size:13px}table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden}td,th{text-align:left;padding:12px 20px;border-bottom:1px solid #edf0f7}th{background:#e6edff;color:#355fd5}.numbers{display:flex;gap:20px;margin:24px 0}.numbers article{flex:1}.number{font-size:36px;color:#355fd5;font-weight:700}</style>`;
const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  const cards = runs.map(run => {
    const state = run.state;
    const selected = {stage: state.stage, status: state.verification.status, findings: state.verification.findings,
      ruleVersion: state.rulePack.version, approval: state.approval.status,
      conflicts: state.conflicts.map(c => ({field: c.field, values: c.values})),
      allowedActions: run.allowedActions};
    return `<article><h2>${escape(run.variant)}</h2><div class="${state.verification.status}">${escape(state.verification.status.toUpperCase())}</div><pre>${escape(JSON.stringify(selected, null, 2))}</pre></article>`;
  }).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8">${style}<header><small>VISAFLOW · ACTUAL CLI OUTPUT</small><span class="badge">DEMO / 合成材料</span></header><h1>材料核验与补正 · 实际运行结果</h1><p>同一规则版本下运行正常材料、姓名冲突与证件过期三个样例。<br>这是 CLI 输出的文档展示视图；未调用模型，未运行桌面界面，未使用真实客户材料。</p><div class="grid">${cards}</div><footer>入口：packages/visa-domain/src/cli.ts demo · 文件引用来自实际解析 · Rule Pack: DEMO-ENTRY@1.0.0</footer>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path: join(output, 'workflow.png'), fullPage: true});
  const rows = report.results.map(r => `<tr><td>${escape(r.sample)}</td><td>${escape(r.status)}</td><td class="pass">${r.pass ? 'PASS' : 'FAIL'}</td><td>${r.replayed}</td></tr>`).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8">${style}<header><small>VISAFLOW · EVALUATION & TRACE REPLAY</small><span class="badge">确定性工程验证</span></header><h1>异常样例与调用回放</h1><p>评估程序的实际输出。覆盖材料缺失、过期、跨文件冲突、模糊类型与审批越权。<br>测试样例结果不代表模型准确率、真实政策覆盖率或生产效果。</p><div class="numbers"><article><div class="number">${report.passed} / ${report.total}</div><p>样例结果符合预期</p></article><article><div class="number">${report.replayed}</div><p>工具调用记录回放一致</p></article><article><div class="number">${escape(report.toolContractVersion)}</div><p>Tool Contract 版本</p></article></div><table><tr><th>样例</th><th>核验状态</th><th>评估</th><th>Replay 调用数</th></tr>${rows}</table><p>Prompt: ${escape(report.promptVersion)} · 固定样例日期：${escape(report.fixtureDate)}</p><footer>入口：packages/visa-domain/src/eval.ts · 仅本地样例 · 无外部审批副作用</footer>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path: join(output, 'evaluation.png'), fullPage: true});
  console.log(JSON.stringify({screenshots: ['workflow.png', 'evaluation.png'], source: 'Actual CLI stdout, synthetic fixtures'}));
} finally {await browser.close();}
