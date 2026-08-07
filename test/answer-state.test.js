import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedChoice, selectChoice, submitChoice } from '../public/answer-state.js';

test('submitting preserves the exact choice the user selected', () => {
  const answer = { selected: null, submitted: null, checked: false, revealed: false, result: null };
  selectChoice(answer, 'choice-c', '2026-08-07T20:00:00.000Z');
  const submission = submitChoice(answer, 'choice-c', '2026-08-07T20:00:01.000Z');

  assert.deepEqual(submission, { submitted: 'choice-c', result: true });
  assert.equal(answer.selected, 'choice-c');
  assert.equal(answer.submitted, 'choice-c');
  assert.equal(displayedChoice(answer), 'choice-c');
  assert.equal(answer.savedAt, '2026-08-07T20:00:01.000Z');
});

test('a later selected-field mutation cannot rewrite the submitted choice on screen', () => {
  const answer = { selected: null, submitted: null, checked: false, revealed: false, result: null };
  selectChoice(answer, 'choice-b', '2026-08-07T20:00:00.000Z');
  submitChoice(answer, 'choice-c', '2026-08-07T20:00:01.000Z');

  answer.selected = 'choice-d';

  assert.equal(answer.result, false);
  assert.equal(answer.submitted, 'choice-b');
  assert.equal(displayedChoice(answer), 'choice-b');
});

test('each new selection receives a newer sync timestamp and clears old submission state', () => {
  const answer = { selected: 'choice-a', submitted: 'choice-a', checked: true, revealed: true, result: true };
  selectChoice(answer, 'choice-d', '2026-08-07T20:00:02.000Z');

  assert.equal(answer.selected, 'choice-d');
  assert.equal(answer.submitted, null);
  assert.equal(answer.checked, false);
  assert.equal(answer.result, null);
  assert.equal(answer.savedAt, '2026-08-07T20:00:02.000Z');
});
