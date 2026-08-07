import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { normalizeChoiceMarkup, normalizeMathMarkup } from '../public/notation.js';

function documentForTest() {
  return parseHTML('<!doctype html><html><body></body></html>').document;
}

test('repairs the SAT absolute-value fence encoding from the reported question', () => {
  const html = '<math alttext="2 StartAbsoluteValue 4 minus x EndAbsoluteValue plus 3 StartAbsoluteValue 4 minus x EndAbsoluteValue equals 25"><mrow><mn>2</mn></mrow><mfenced open="" close="|"><mrow><mn>4</mn><mo>-</mo><mi>x</mi></mrow></mfenced><mo>+</mo><mrow><mn>3</mn></mrow><mfenced open="" close="|"><mrow><mn>4</mn><mo>-</mo><mi>x</mi></mrow></mfenced><mo>=</mo><mn>25</mn></math>';
  const normalized = normalizeMathMarkup(html, documentForTest());
  const document = documentForTest();
  document.body.innerHTML = normalized;
  assert.equal(document.body.textContent.replace(/\s/g, ''), '2|4-x|+3|4-x|=25');
  assert.equal(document.querySelectorAll('mfenced').length, 0);
  assert.equal(document.querySelectorAll('mo[fence="true"]').length, 4);
});

test('preserves ordinary mfenced notation as parentheses', () => {
  const normalized = normalizeMathMarkup('<math><mfenced><mi>x</mi><mi>y</mi></mfenced></math>', documentForTest());
  const document = documentForTest();
  document.body.innerHTML = normalized;
  assert.equal(document.body.textContent.replace(/\s/g, ''), '(x,y)');
});

test('keeps punctuation visible while removing duplicate screen-reader text', () => {
  const normalized = normalizeChoiceMarkup('<span aria-hidden="true">;</span><span class="sr-only">semicolon</span>', documentForTest());
  const document = documentForTest();
  document.body.innerHTML = normalized;
  assert.equal(document.body.textContent, ';');
  assert.equal(document.querySelector('[aria-hidden="true"]'), null);
});
