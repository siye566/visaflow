#!/usr/bin/env bun
/** Check static translation references against the canonical locale.
 * AST parsing ignores comments and unrelated strings. Dynamic expressions are
 * counted but require separate review; this is not a hardcoded-text detector.
 */
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dir, '..');
const canonical: Record<string, string> = JSON.parse(readFileSync(resolve(root, 'packages/shared/src/i18n/locales/en.json'), 'utf8'));
const errors: string[] = [];
let files = 0, literals = 0, dynamic = 0;
function scan(directory: string): void {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '__tests__', '__mocks__'].includes(entry.name)) scan(path);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec|stories|d)\.tsx?$/.test(entry.name)) continue;
    files++;
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 't')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'))) {
        const argument = node.arguments[0];
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          literals++;
          const options = node.arguments[1];
          const hasCount = options && ts.isObjectLiteralExpression(options) && options.properties.some(property =>
            (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
            && property.name.getText(source).replace(/['"]/g, '') === 'count');
          const plural = hasCount && Object.hasOwn(canonical, `${argument.text}_other`);
          if (!Object.hasOwn(canonical, argument.text) && !plural) {
            const {line} = source.getLineAndCharacterOfPosition(argument.getStart(source));
            errors.push(`${relative(root, path)}:${line + 1}: unknown translation key ${argument.text}`);
          }
        } else dynamic++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const directory of ['apps/electron/src', 'packages/shared/src', 'packages/ui/src']) scan(resolve(root, directory));
if (errors.length) {
  console.error(`i18n coverage failed (${errors.length} missing static keys):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`i18n coverage OK (${files} production files, ${literals} static references; ${dynamic} dynamic expressions require review)`);
