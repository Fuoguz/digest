import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build output');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const entries = [
  ['index.html', 'index.html'],
  ['app', 'app'],
  ['src/landing.js', 'src/landing.js'],
  ['src/styles', 'src/styles'],
  ['src/workspace', 'src/workspace'],
  ['src/domain', 'src/domain'],
  ['src/data', 'src/data'],
  ['src/importers', 'src/importers'],
  ['src/reader', 'src/reader'],
  ['src/ai', 'src/ai'],
  ['vendor', 'vendor'],
  ['server.js', 'server.js'],
  ['package.json', 'package.json']
];
for (const [source, destination] of entries) {
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, source), target, { recursive: true });
}

const required = ['index.html', 'app/index.html', 'src/workspace/main.js', 'vendor/pdfjs/pdf.mjs'];
for (const file of required) await stat(path.join(output, file));
console.log('Built Digest v0.2 to dist/');
