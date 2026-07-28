import { readFile } from 'node:fs/promises';

const required = [
  'public/practice-app.js',
  'public/queue.js',
  'public/answers.js',
  'app/practice/practice.css',
];

for (const path of required) {
  const source = await readFile(path, 'utf8');
  if (!source.trim()) throw new Error(`Required committed asset is empty: ${path}`);
}

const app = await readFile('public/practice-app.js', 'utf8');
if (!app.includes('Daily Fifty global spoken-label normalization v6.1.15')) {
  throw new Error('practice-app.js is not the final v6.1.15 production runtime.');
}
if (!app.includes("['blank', '']") || !app.includes("['comma', ',']")) {
  throw new Error('Global spoken-label symbol mappings are missing.');
}

console.log('Using committed Daily Fifty production assets. No live-site scraping performed.');
