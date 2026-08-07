import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOrderedPlan } from '../public/queue.js';
import { cloudChanges, sameIdSet } from '../public/cloud-sync.js';
import { calculatorRatioFromPointer, clampCalculatorRatio } from '../public/calculator-layout.js';

const id = (number) => number.toString(16).padStart(8, '0');

test('question planning excludes every previously seen id', () => {
  const buckets = {
    rw_easy: [],
    rw_medium: [],
    rw_vocab: Array.from({ length: 8 }, (_, index) => id(index + 1)),
    rw_hard: Array.from({ length: 50 }, (_, index) => id(index + 100)),
    math_hard: Array.from({ length: 40 }, (_, index) => id(index + 1000)),
  };
  const seen = [buckets.rw_vocab[0], buckets.rw_hard[0], buckets.math_hard[0]];
  const { plan } = buildOrderedPlan(buckets, { completed: seen });
  assert.equal(plan.length, 50);
  assert.equal(plan.some((question) => seen.includes(question.id)), false);
});

test('cloud id ordering does not create a false merge', () => {
  assert.equal(sameIdSet(['0000000a', '0000000b'], ['0000000b', '0000000a']), true);
  const remote = { completed: ['0000000b', '0000000a'], blocked: [], seen: [], session: {} };
  const local = { completed: ['0000000a', '0000000b'], blocked: [], seen: [], session: {} };
  assert.equal(cloudChanges(remote, local).changed, false);
});

test('an older sync response cannot erase local seen history during deployment', () => {
  const local = { completed: [], blocked: [], seen: ['0000000a'], session: {} };
  const changes = cloudChanges({ completed: [], blocked: [], session: {} }, local);
  assert.deepEqual(changes.seen, ['0000000a']);
  assert.equal(changes.changed, false);
});

test('practice navigation has no full-page refresh or routine merge toast', async () => {
  const sources = await Promise.all([
    readFile(new URL('../public/practice-app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/cloud-sync.js', import.meta.url), 'utf8'),
  ]);
  const combined = sources.join('\n');
  assert.equal(combined.includes('location.reload'), false);
  assert.equal(combined.includes('Progress merged'), false);
});

test('calculator split ratio clamps and follows horizontal and vertical drags', () => {
  assert.equal(clampCalculatorRatio(-20), 30);
  assert.equal(clampCalculatorRatio(92), 70);
  assert.equal(clampCalculatorRatio('not-a-number'), 50);
  assert.equal(calculatorRatioFromPointer({ clientX: 600 }, { left: 100, width: 1000 }), 50);
  assert.equal(calculatorRatioFromPointer({ clientY: 450 }, { top: 50, height: 800 }, true), 50);
});

test('math calculator controls are embedded between navigation buttons and keep answers outside the split', async () => {
  const page = await readFile(new URL('../app/practice/page.js', import.meta.url), 'utf8');
  const previous = page.indexOf('id="previousButton"');
  const calculator = page.indexOf('id="calculatorButton"');
  const skip = page.indexOf('id="skipButton"');
  const answerColumn = page.indexOf('className="answer-column"');
  assert.ok(previous >= 0 && previous < calculator && calculator < skip);
  assert.ok(page.includes('data-src="https://www.desmos.com/testing/collegeboard/graphing"'));
  assert.ok(page.indexOf('id="calculatorPane"') < answerColumn);
});

test('calculator stays math-only, preserves its iframe, and supports keyboard resizing', async () => {
  const app = await readFile(new URL('../public/practice-app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("const isMath = item?.subject === 'Math'"));
  assert.ok(app.includes("if (active && !state.calculator.loaded)"));
  assert.ok(app.includes("event.key === 'Home'"));
  assert.ok(app.includes("event.key === 'End'"));
  assert.ok(app.includes("aria-orientation"));
});

test('practice ships its complete base stylesheet instead of deployment-only refinements', async () => {
  const css = await readFile(new URL('../app/practice/practice.css', import.meta.url), 'utf8');
  const requiredRules = [
    '.app-shell',
    '.topbar',
    '.workspace',
    '.question-toolbar',
    '.question-panel',
    '.answer-column',
    '.answer-card',
    '.choice-select',
    '.question-grid',
    '.timer-ring circle',
  ];
  assert.ok(css.length >= 20_000);
  for (const rule of requiredRules) assert.ok(css.includes(rule), `missing ${rule}`);
  assert.match(css, /\.timer-ring circle\s*\{[^}]*fill:\s*none/s);
});

test('timer SVG remains bounded and transparent even before CSS loads', async () => {
  const page = await readFile(new URL('../app/practice/page.js', import.meta.url), 'utf8');
  assert.match(page, /<svg className="timer-ring" width="54" height="54"[^>]*fill="none"/);
  assert.equal((page.match(/<circle[^>]*fill="none"/g) ?? []).length, 2);
});

test('English navigation stays on opposite sides when the calculator is hidden', async () => {
  const css = await readFile(new URL('../app/practice/practice.css', import.meta.url), 'utf8');
  assert.match(css, /\.below-question-actions #previousButton\s*\{\s*grid-column:\s*1;/s);
  assert.match(css, /\.below-question-actions #skipButton\s*\{[^}]*grid-column:\s*3;/s);
  assert.match(css, /\.button-calculator\s*\{[^}]*grid-column:\s*2;/s);
});

test('practice chrome scrolls away and long choices keep readable spacing', async () => {
  const css = await readFile(new URL('../app/practice/practice.css', import.meta.url), 'utf8');
  assert.match(css, /\.topbar\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /\.answer-column\s*\{[^}]*position:\s*static;/s);
  assert.match(css, /\.answer-area\s*\{[^}]*gap:\s*14px;/s);
  assert.match(css, /\.choice-content,\s*\.choice-content p\s*\{[^}]*font-size:\s*18px\s*!important;[^}]*line-height:\s*1\.55\s*!important;/s);
});

test('navigation widths, answer height, choice pills, and content typography are standardized', async () => {
  const css = await readFile(new URL('../app/practice/practice.css', import.meta.url), 'utf8');
  assert.match(css, /\.below-question-actions #previousButton\s*\{[^}]*width:\s*min\(220px,\s*100%\);/s);
  assert.match(css, /\.below-question-actions #skipButton\s*\{[^}]*width:\s*min\(220px,\s*100%\);/s);
  assert.match(css, /\.workspace\s*\{[^}]*align-items:\s*stretch;/s);
  assert.match(css, /\.answer-column\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.answer-card\s*\{[^}]*min-height:\s*100%;/s);
  assert.match(css, /\.choice\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(css, /\.answer-card \.button\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(css, /\.choice-content,\s*\.choice-content p\s*\{[^}]*font-family:\s*Georgia,[^}]*font-size:\s*18px\s*!important;/s);
});
