// Public test data only: fictional person, document number and destination.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// Use the same bundled Latin font on all platforms; never depend on a fallback.
GlobalFonts.registerFromPath(fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)), 'VisaFixtureLatin');
const cjkPath = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'Fonts/msyh.ttc') : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if (existsSync(cjkPath)) GlobalFonts.registerFromPath(cjkPath, 'VisaFixtureCJK');
export const LABELLED_LINES = ['Name: LIN DEMO', 'Passport number: E00000001', 'Date of birth: 1998-01-02', 'Expiry date: 2030-12-31', 'Departure date: 2026-12-01'];
export async function textPdf(pages: string[][] = [LABELLED_LINES]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('VisaFlow synthetic test material'); doc.setAuthor('VisaFlow synthetic fixtures');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    page.drawText('SYNTHETIC MATERIAL / DEMO ONLY', {x: 50, y: 740, size: 15, font});
    lines.forEach((line, index) => page.drawText(line, {x: 50, y: 680-index*40, size: 16, font}));
  }
  return Buffer.from(await doc.save());
}
export function scanImage(lines = LABELLED_LINES, format: 'png' | 'jpeg' = 'png'): Buffer {
  const canvas = createCanvas(1800, 1050); const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0,0,canvas.width,canvas.height); context.fillStyle = 'black';
  context.font = '42px "VisaFixtureLatin", "VisaFixtureCJK", sans-serif';
  context.fillText('SYNTHETIC MATERIAL / DEMO ONLY', 80, 110);
  lines.forEach((line,index) => context.fillText(line, 80, 230+index*115));
  return format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg');
}
export async function scannedPdf(mixed = false): Promise<Buffer> {
  const doc = mixed ? await PDFDocument.load(await textPdf([['Name: LIN DEMO']])) : await PDFDocument.create();
  const image = await doc.embedPng(scanImage());
  const page = doc.addPage([720,420]); page.drawImage(image, {x:0,y:0,width:720,height:420});
  // A real text overlay must not hide the scanned material from OCR.
  if (mixed) page.drawText('Scan attachment', {x:5,y:400,size:8});
  return Buffer.from(await doc.save());
}
