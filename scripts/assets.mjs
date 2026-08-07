import { readFile } from 'node:fs/promises';

const required = [
  'public/practice-app.js',
  'public/notation.js',
  'public/cloud-sync.js',
  'public/calculator-layout.js',
  'public/queue.js',
  'public/answers.js',
  'app/practice/practice.css',
];

for (const path of required) {
  const source = await readFile(path, 'utf8');
  if (!source.trim()) throw new Error(`Required committed asset is empty: ${path}`);
}

const app = await readFile('public/practice-app.js', 'utf8');
const notation = await readFile('public/notation.js', 'utf8');
const sync = await readFile('public/cloud-sync.js', 'utf8');
if (!app.includes("from '/notation.js'") || !notation.toLowerCase().includes('startabsolutevalue')) {
  throw new Error('Complete SAT notation normalization is missing.');
}
if (app.includes('location.reload') || sync.includes('location.reload')) {
  throw new Error('Practice navigation must never use a full-page reload.');
}
if (app.includes('Progress merged') || sync.includes('Progress merged')) {
  throw new Error('Routine cloud sync must stay silent.');
}
if (!app.includes("from '/calculator-layout.js'") || !app.includes('syncCalculator(item)')) {
  throw new Error('The math-only Desmos split layout is missing.');
}

console.log('Using committed Daily Fifty production assets. No live-site scraping performed.');
