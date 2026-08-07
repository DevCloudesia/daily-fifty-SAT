import { readFile } from 'node:fs/promises';

const required = [
  'public/practice-app.js',
  'public/answer-state.js',
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
const practiceCss = await readFile('app/practice/practice.css', 'utf8');
const practicePage = await readFile('app/practice/page.js', 'utf8');
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
if (!app.includes("from '/answer-state.js'") || !app.includes('submitChoice(answer, question.correctChoice)')) {
  throw new Error('Answer submission integrity helpers are missing.');
}
const requiredPracticeRules = [
  '.app-shell',
  '.workspace',
  '.question-panel',
  '.answer-column',
  '.choice-select',
  '.timer-ring circle',
];
if (practiceCss.length < 20_000 || requiredPracticeRules.some((rule) => !practiceCss.includes(rule))) {
  throw new Error('The complete committed practice stylesheet is missing.');
}
if (!practiceCss.includes('fill: none') || !practicePage.includes('width="54" height="54"') || !practicePage.includes('fill="none"')) {
  throw new Error('The timer SVG is missing its bounded no-fill safety fallback.');
}

console.log('Using committed Daily Fifty production assets. No live-site scraping performed.');
