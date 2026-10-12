// Isolated Node/Bun process. stdout is one bounded JSON result; never log material text.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { MODEL_HASHES } from './ocr-models.mjs';
const require = createRequire(import.meta.url);
const LIMIT_PIXELS = 16_000_000;
let ocrWorker;
let pdf;
let pdfTask;
function fail(code) { throw new Error(code); }
function dimensions(width, height) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0 || width * height > LIMIT_PIXELS) fail('DOCUMENT_DIMENSIONS_EXCEEDED');
}
async function ocr(image, width, height) {
  dimensions(width, height);
  if (!ocrWorker) {
    const languages = (process.env.VISAFLOW_OCR_LANGS || 'eng+chi_sim').split('+');
    if (!languages.length || languages.some(l => !['eng', 'chi_sim'].includes(l))) fail('OCR_LANGUAGE_INVALID: eng and chi_sim supported');
    const langPath = resolve(process.env.VISAFLOW_OCR_DATA_DIR || fileURLToPath(new URL('../.cache/ocr', import.meta.url)));
    for (const lang of languages) {
      const model = await readFile(resolve(langPath, `${lang}.traineddata`)).catch(() => fail('OCR_MODELS_MISSING: run npm run setup:ocr in packages/visa-domain'));
      if (createHash('sha256').update(model).digest('hex') !== MODEL_HASHES[lang]) fail('OCR_MODEL_HASH_MISMATCH: run npm run setup:ocr');
    }
    const { createWorker, PSM } = await import('tesseract.js');
    ocrWorker = await createWorker(languages, 1, {langPath, gzip: false, cacheMethod: 'none', errorHandler: () => {} });
    await ocrWorker.setParameters({tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1'});
  }
  const {data} = await ocrWorker.recognize(image, {}, {text: true, blocks: true});
  const lines = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines)).map(l => ({
    text: l.text.trim(), confidence: l.confidence,
    bbox: [l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1],
  })).filter(l => l.text);
  return {method: 'ocr', width, height, unit: 'px', lines};
}
function textLines(items, height) {
  const rows = [];
  for (const item of items.filter(i => typeof i.str === 'string' && i.str.trim()).sort((a,b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const x = item.transform[4], y = item.transform[5], h = Math.abs(item.height || item.transform[3] || 10);
    let row = rows.find(r => Math.abs(r.y - y) < Math.min(3, h / 3));
    if (!row) { row = {y, items: []}; rows.push(row); }
    row.items.push({text: item.str, x, y, w: item.width, h});
  }
  return rows.map(r => {
    r.items.sort((a,b) => a.x-b.x);
    return {text: r.items.map(i => i.text).join(' ').trim(), bbox: [Math.min(...r.items.map(i=>i.x)), height-Math.max(...r.items.map(i=>i.y+i.h)), Math.max(...r.items.map(i=>i.x+i.w)), height-Math.min(...r.items.map(i=>i.y))]};
  });
}
async function main() {
  const parts = []; let length = 0;
  for await (const part of process.stdin) { length += part.length; if (length > 20 * 1024 * 1024) fail('DOCUMENT_TOO_LARGE'); parts.push(part); }
  const bytes = Buffer.concat(parts);
  const extension = process.argv[2];
  const pages = [];
  const {createCanvas, loadImage} = await import('@napi-rs/canvas');
  if (extension === '.pdf') {
    const {getDocument, OPS} = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
    const assetUrl = directory => `${pathToFileURL(resolve(pdfRoot, directory)).href}/`;
    pdfTask = getDocument({data: new Uint8Array(bytes), isEvalSupported: false, useWorkerFetch: false,
      cMapUrl: assetUrl('cmaps'), cMapPacked: true, standardFontDataUrl: assetUrl('standard_fonts'), wasmUrl: assetUrl('wasm'), verbosity: 0});
    pdf = await pdfTask.promise;
    if (!pdf.numPages || pdf.numPages > 20) fail('DOCUMENT_PAGE_LIMIT: maximum 20 pages');
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const view = page.getViewport({scale: 1}); dimensions(view.width, view.height);
      const text = textLines((await page.getTextContent()).items, view.height);
      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
        OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup].includes(op));
      if (text.length && !hasImages) pages.push({number, method: 'pdf-text', width: view.width, height: view.height, unit: 'pt', lines: text});
      else {
        // Embedded-image pages always undergo OCR, even if they have a title/text overlay.
        const viewport = page.getViewport({scale: 2.5}); dimensions(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({canvas, canvasContext: canvas.getContext('2d'), viewport}).promise;
        pages.push({number, ...await ocr(canvas.toBuffer('image/png'), canvas.width, canvas.height)});
      }
      page.cleanup();
    }
  } else {
    if (extension === '.png' && bytes.length >= 24) dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    if (extension !== '.png') {
      let offset = 2;
      while (offset+9 < bytes.length && bytes[offset] === 255) {
        const marker = bytes[offset+1];
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
          dimensions(bytes.readUInt16BE(offset+7), bytes.readUInt16BE(offset+5)); break;
        }
        const size = bytes.readUInt16BE(offset+2); if (size < 2) break; offset += size+2;
      }
    }
    const image = await loadImage(bytes); dimensions(image.width, image.height);
    pages.push({number: 1, ...await ocr(bytes, image.width, image.height)});
  }
  if (!pages.some(p => p.lines.length)) fail('DOCUMENT_NO_TEXT');
  if (JSON.stringify(pages).length > 1_500_000) fail('EXTRACTION_TOO_LARGE');
  const requiresReview = pages.some(p => p.method === 'ocr');
  const warnings = [];
  if (requiresReview) warnings.push('OCR_REVIEW_REQUIRED');
  if (pages.some(p => p.method === 'ocr' && p.lines.some(l => l.confidence < 85))) warnings.push('OCR_LOW_CONFIDENCE');
  if (pages.some(p => !p.lines.length)) warnings.push('EMPTY_PAGE');
  return {version: 'pdfjs-tesseract-1', format: extension === '.pdf' ? 'pdf' : extension === '.png' ? 'png' : 'jpeg', pages, warnings, requiresReview};
}
try { console.log(JSON.stringify(await main())); }
catch (error) {
  const safeCodes = ['OCR_', 'DOCUMENT_', 'EXTRACTION_'];
  const message = error?.message || '';
  const code = error?.name === 'PasswordException' ? 'DOCUMENT_ENCRYPTED: unprotected local copy required'
    : safeCodes.some(prefix => message.startsWith(prefix)) ? message : 'DOCUMENT_INVALID: extraction failed';
  console.log(JSON.stringify({error: code})); process.exitCode = 1;
} finally { await ocrWorker?.terminate(); await pdfTask?.destroy(); }
