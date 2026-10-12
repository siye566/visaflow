import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { extname, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DocumentInput, Field } from './engine.ts';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const EXTRACTION_VERSION = 'pdfjs-tesseract-1';
export interface ExtractedLine {
  text: string; bbox: [number, number, number, number]; confidence?: number;
}
export interface ExtractedPage {
  number: number; method: 'pdf-text' | 'ocr'; width: number; height: number;
  unit: 'pt' | 'px'; lines: ExtractedLine[];
}
export interface Extraction {
  version: string; format: 'pdf' | 'png' | 'jpeg'; pages: ExtractedPage[];
  warnings: string[]; requiresReview: boolean;
}
export function sourceHash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function isBinaryDocument(file: string): boolean { return ['.pdf', '.png', '.jpg', '.jpeg'].includes(extname(file).toLowerCase()); }

/** A bounded child process receives captured bytes, never a URL or model-provided command. */
export async function extractDocument(file: string, bytes: Buffer): Promise<DocumentInput> {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_TOO_LARGE');
  const extension = extname(file).toLowerCase();
  if (!isBinaryDocument(file)) {
    if (!['.json', '.txt'].includes(extension)) throw new Error('UNSUPPORTED_FORMAT: JSON, TXT, PDF, PNG or JPEG required');
    if (bytes.length > 1024 * 1024) throw new Error('DOCUMENT_TOO_LARGE');
    return {file, content: bytes.toString('utf8'), sourceHash: sourceHash(bytes)};
  }
  const valid = extension === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw new Error('DOCUMENT_INVALID: file signature does not match extension');
  const base = typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url));
  const worker = [join(base, 'document-worker.mjs'), join(base, 'visa-document/src/document-worker.mjs')].find(existsSync);
  if (!worker) throw new Error('EXTRACTION_UNAVAILABLE: build/copy VisaFlow document runtime');
  const extraction = await new Promise<Extraction>((resolve, reject) => {
    const child = spawn(process.execPath, [worker, extension], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}});
    const chunks: Buffer[] = []; let count = 0; let timedOut = false; let tooLarge = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      count += chunk.length;
      if (count > 2 * 1024 * 1024) { tooLarge = true; child.kill(); }
      else chunks.push(chunk);
    });
    // Library diagnostics may contain private document text; do not expose them.
    child.stderr.resume(); child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('EXTRACTION_UNAVAILABLE: install visa-domain dependencies')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('EXTRACTION_TIMEOUT'));
      if (tooLarge) return reject(new Error('EXTRACTION_TOO_LARGE'));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (code !== 0 || result.error) throw new Error(result.error ?? 'DOCUMENT_INVALID: extraction failed');
        if (result.version !== EXTRACTION_VERSION || !Array.isArray(result.pages) || !result.pages.length) throw new Error('EXTRACTION_INVALID');
        resolve(result);
      } catch (error) { reject(error instanceof SyntaxError ? new Error('EXTRACTION_UNAVAILABLE: install visa-domain dependencies') : error); }
    });
    child.stdin.end(bytes);
  });
  return {file, sourceHash: sourceHash(bytes), content: extraction.pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n'), extraction};
}

// Labels are deterministic; no model inference, date rewriting or OCR character correction.
const aliases: Record<string, string> = {
  name: 'name', fullname: 'name', 姓名: 'name', passportnumber: 'passportNumber', passportno: 'passportNumber',
  护照号: 'passportNumber', 护照号码: 'passportNumber', birthdate: 'birthDate', dateofbirth: 'birthDate', 出生日期: 'birthDate',
  expirydate: 'expiryDate', dateofexpiry: 'expiryDate', 有效期至: 'expiryDate', 到期日期: 'expiryDate',
  departuredate: 'departureDate', 出行日期: 'departureDate', 出发日期: 'departureDate', nationality: 'nationality', 国籍: 'nationality',
};
export function fieldsFromExtraction(extraction: Extraction): Field[] {
  const fields: Field[] = [];
  for (const page of extraction.pages) page.lines.forEach((line, index) => {
    const match = /^\s*([^:：]{1,60})\s*[:：]\s*(.+?)\s*$/.exec(line.text);
    if (!match) return;
    const name = aliases[match[1]!.toLowerCase().replace(/[\s_.-]/g, '')];
    if (!name) return;
    const value = match[2]!.trim();
    if (!value || value.length > 500) throw new Error('DOCUMENT_INVALID: field length');
    const previous = fields.find(f => f.name === name);
    if (previous && previous.value !== value) throw new Error(`DOCUMENT_AMBIGUOUS: conflicting ${name} labels`);
    if (!previous) fields.push({name, value, location: `page:${page.number}/line:${index + 1}`, bbox: line.bbox,
      sourceText: line.text, method: page.method, ...(line.confidence === undefined ? {} : {confidence: line.confidence})});
  });
  if (!fields.length) throw new Error('DOCUMENT_FIELDS_NOT_FOUND: labelled fields required; see docs/pdf-ocr.md');
  return fields;
}
