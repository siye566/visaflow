import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { get } from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { MODEL_COMMIT as commit, MODEL_HASHES as models } from '../src/ocr-models.mjs';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
function download(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, {agent}, response => {
      if (response.statusCode !== 200) {response.resume(); return reject(new Error(`MODEL_DOWNLOAD_FAILED: HTTP ${response.statusCode}`));}
      const chunks = []; let size = 0;
      response.on('data', chunk => {size += chunk.length; if(size>10*1024*1024) response.destroy(new Error('MODEL_DOWNLOAD_TOO_LARGE')); else chunks.push(chunk);});
      response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    });
    const timer = setTimeout(() => request.destroy(new Error('MODEL_DOWNLOAD_TIMEOUT')), 60_000);
    request.on('close', () => clearTimeout(timer)); request.on('error', reject);
  });
}
const directory = resolve(process.env.VISAFLOW_OCR_DATA_DIR || fileURLToPath(new URL('../.cache/ocr', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, {recursive: true});
for (const [language, hash] of Object.entries(models)) {
  const path = resolve(directory, `${language}.traineddata`);
  const cached = await readFile(path).catch(() => null);
  if (cached && sha(cached) === hash) { console.log(`${language}: verified local model`); continue; }
  const bytes = await download(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${language}.traineddata`);
  if (sha(bytes) !== hash) throw new Error(`MODEL_HASH_MISMATCH: ${language}`);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, {flag: 'wx'});
  try { await rename(temporary, path); } finally { await unlink(temporary).catch(() => {}); }
  console.log(`${language}: downloaded and SHA-256 verified`);
}
console.log('OCR ready (local English + simplified Chinese). Models: tesseract-ocr/tessdata_fast, Apache-2.0.');
