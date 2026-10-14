// Bundles the engine into the interview page.
//   web/index.html     full document, open it directly in a browser
//   web/artifact.html  body fragment for publishing as a claude.ai artifact
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'TaxEngine',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const engine = result.outputFiles[0].text;

const template = readFileSync('web/template.html', 'utf8');
if (!template.includes('<!--ENGINE-->')) throw new Error('template is missing the <!--ENGINE--> marker');
// Replacer function: a string replacement would expand `$&`, `$'` etc. inside the minified code.
const fragment = template.replace('<!--ENGINE-->', () => `<script>${engine}</script>`);

mkdirSync('web', { recursive: true });
writeFileSync('web/artifact.html', fragment);
writeFileSync(
  'web/index.html',
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body style="margin:0">\n${fragment}\n</body>\n</html>\n`,
);
console.log(`engine bundle ${(engine.length / 1024).toFixed(0)} KB, page ${(fragment.length / 1024).toFixed(0)} KB`);
