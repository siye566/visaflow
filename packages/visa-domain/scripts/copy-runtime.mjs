import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const domain = fileURLToPath(new URL('..', import.meta.url));
// Walk explicitly: Node's fs.cpSync crashes on some Windows native-package trees.
function copyTree(source, destination) {
  if (statSync(source).isDirectory()) {
    mkdirSync(destination, {recursive:true});
    for (const entry of readdirSync(source)) copyTree(join(source,entry),join(destination,entry));
  } else copyFileSync(source,destination);
}
/** Keep native binaries, PDF fonts/CMaps/WASM and OCR models outside JS bundles. */
export function copyDocumentRuntime(output, target = {platform: process.platform, arch: process.arch}) {
  if (target.platform !== process.platform || target.arch !== process.arch) throw new Error('VISA_DOCUMENT_BUILD_TARGET: install/build native canvas dependencies on the target OS/architecture');
  const destination = resolve(output, 'visa-document');
  mkdirSync(join(destination,'src'), {recursive:true});
  for (const file of ['document-worker.mjs','ocr-models.mjs']) copyFileSync(join(domain,'src',file),join(destination,'src',file));
  copyTree(join(domain,'licenses'),join(destination,'licenses'));
  const lock = JSON.parse(readFileSync(join(domain,'package-lock.json'),'utf8'));
  for (const [path,metadata] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || metadata.dev) continue;
    const source = join(domain,path);
    if (!existsSync(source)) {
      if(metadata.optional) continue;
      throw new Error('VISA_DOCUMENT_DEPENDENCIES_MISSING: npm ci --ignore-scripts --workspaces=false in packages/visa-domain');
    }
    copyTree(source,join(destination,path));
  }
  const models = resolve(process.env.VISAFLOW_OCR_DATA_DIR || join(domain,'.cache/ocr'));
  mkdirSync(join(destination,'.cache/ocr'),{recursive:true});
  for (const language of ['eng','chi_sim']) {
    const model = join(models,`${language}.traineddata`);
    if (!existsSync(model)) throw new Error('OCR_MODELS_MISSING: npm run setup:ocr before building');
    copyFileSync(model,join(destination,'.cache/ocr',`${language}.traineddata`));
  }
  console.log('Copied local VisaFlow PDF/OCR runtime');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if(!process.argv[2]) throw new Error('Usage: node copy-runtime.mjs <bundle-directory>');
  copyDocumentRuntime(process.argv[2]);
}
