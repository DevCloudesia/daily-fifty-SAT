import { INDEX_URL, PLAN_VERSION, buildCandidatePools, buildOrderedPlan, isValidSession, nextIncompleteIndex } from '/queue.js';
import { gridInMatches } from '/answers.js';
import { normalizeChoiceMarkup, normalizeMathMarkup } from '/notation.js';
import { normalizeIds, startCloudSync } from '/cloud-sync.js';
import { CALCULATOR_DEFAULT_RATIO, calculatorRatioFromPointer, clampCalculatorRatio } from '/calculator-layout.js';

const API_URL = '/api/question';
const PREFETCH_PREFIX = 'dailyFifty.prefetchedQuestion.';
const TIMER_SECONDS = 60;
const STORAGE = Object.freeze({
  completed: 'dailyFifty.completed.v4',
  blocked: 'dailyFifty.blocked.v4',
  seen: 'dailyFifty.seen.v1',
  session: 'dailyFifty.session.v4',
  preferences: 'dailyFifty.preferences.v4',
});
const LEGACY_KEYS = Object.freeze({
  completed: 'dailyFifty.completed.v3',
  blocked: 'dailyFifty.blocked.v3',
  session: 'dailyFifty.session.v3',
  preferences: 'dailyFifty.preferences.v3',
});
const TRACKS = Object.freeze([
  Object.freeze({ name: 'Quiz Pulse', root: 220, pattern: [0, 7, 12, 7, 3, 10, 12, 10], wave: 'triangle' }),
  Object.freeze({ name: 'Orbit Focus', root: 196, pattern: [0, 4, 7, 11, 7, 4, 2, 7], wave: 'sine' }),
  Object.freeze({ name: 'Pixel Sprint', root: 246.94, pattern: [0, 3, 7, 10, 12, 10, 7, 3], wave: 'square' }),
  Object.freeze({ name: 'Calm Current', root: 174.61, pattern: [0, 7, 5, 12, 9, 5, 2, 7], wave: 'sine' }),
]);
const CORRECT_MESSAGES = Object.freeze([
  'Clean hit. Keep the current moving.',
  'Locked in. Next one.',
  'Sharp solve. Momentum +1.',
  'That one clicked.',
  'Nice work. The streak is alive.',
  'Correct. Brain gears engaged.',
  'Solid. Keep rolling.',
  'You found the hinge. Onward.',
]);
const SUCCESS_NOTE_PATTERNS = Object.freeze([
  Object.freeze([523.25, 659.25, 783.99]),
  Object.freeze([440, 554.37, 659.25, 880]),
  Object.freeze([659.25, 783.99, 987.77]),
  Object.freeze([392, 523.25, 698.46]),
]);
const CELEBRATION_VARIANTS = Object.freeze(['confetti', 'sparkles', 'comets', 'rings']);
const LOADING_QUOTES = Object.freeze([
  'Breathe in. Read what is actually there.',
  'One question is small enough to solve.',
  'Clarity arrives one sentence at a time.',
  'Slow eyes. Sharp choices.',
  'You do not need certainty to begin.',
  'Find the hinge, then move the door.',
]);

const state = {
  date: '',
  plan: [],
  reserve: {},
  fullBuckets: null,
  index: 0,
  answers: {},
  questionCache: new Map(),
  completed: new Set(),
  blocked: new Set(),
  seen: new Set(),
  loadingQuestion: false,
  hasRenderedQuestion: false,
  loadController: null,
  loadSequence: 0,
  startSequence: 0,
  timerInterval: null,
  timerRemaining: TIMER_SECONDS,
  timerOvertime: false,
  overtimeSeconds: 0,
  alertAudio: { context: null, gain: null },
  celebrationCounter: 0,
  music: { enabled: false, context: null, gain: null, interval: null, step: 0, trackIndex: 0 },
  calculator: { open: false, loaded: false, ratio: CALCULATOR_DEFAULT_RATIO, dragging: false },
  toastTimer: null,
};
const elements = {};

function localDate() {
  try {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Daily Fifty storage write failed.', error);
    return false;
  }
}

function readIdArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value.filter((id) => /^[0-9a-f]{8}$/i.test(String(id))) : [];
}

function migrateLegacyStorage() {
  if (!localStorage.getItem(STORAGE.completed)) writeJson(STORAGE.completed, readIdArray(LEGACY_KEYS.completed));
  if (!localStorage.getItem(STORAGE.blocked)) writeJson(STORAGE.blocked, readIdArray(LEGACY_KEYS.blocked));
  if (!localStorage.getItem(STORAGE.preferences)) writeJson(STORAGE.preferences, readJson(LEGACY_KEYS.preferences, {}));
}

function cacheElements() {
  const ids = [
    'progressLabel','mixLabel','progressBar','musicButton','musicLabel','focusButton','subjectBadge','difficultyBadge','skillLabel',
    'timerRing','timerText','questionStage','questionCard','previousButton','calculatorButton','skipButton','calculatorPane',
    'calculatorDivider','closeCalculator','desmosFrame','answerArea','feedback','questionCounter','checkButton',
    'revealButton','completeButton','explanationCard','explanationContent','collapseExplanation','questionNavigator','loadingOverlay',
    'loadingMessage','errorOverlay','errorMessage','retryButton','toast',
  ];
  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Practice page is missing #${id}.`);
    elements[id] = element;
  }
  elements.timerWrap = document.querySelector('.timer-wrap');
  elements.timerUnit = document.querySelector('.timer-copy span');
  if (!elements.timerWrap || !elements.timerUnit) throw new Error('Practice page is missing timer elements.');
}

function bindEvents() {
  elements.musicButton.addEventListener('click', toggleMusic);
  elements.focusButton.addEventListener('click', toggleFullscreen);
  elements.previousButton.addEventListener('click', () => navigateRelative(-1));
  elements.calculatorButton.addEventListener('click', toggleCalculator);
  elements.closeCalculator.addEventListener('click', () => setCalculatorOpen(false));
  elements.calculatorDivider.addEventListener('pointerdown', startCalculatorResize);
  elements.calculatorDivider.addEventListener('keydown', handleCalculatorResizeKey);
  elements.skipButton.addEventListener('click', () => navigateRelative(1));
  elements.checkButton.addEventListener('click', checkAnswer);
  elements.revealButton.addEventListener('click', () => revealAnswer('manual'));
  elements.completeButton.addEventListener('click', completeCurrentQuestion);
  elements.collapseExplanation.addEventListener('click', () => elements.explanationCard.classList.add('hidden'));
  elements.retryButton.addEventListener('click', () => { hideError(); void start(true); });
  document.addEventListener('keydown', handleKeyboard);
  const primeAudio = () => { void ensureAlertAudio(); };
  document.addEventListener('pointerdown', primeAudio, { once: true });
  document.addEventListener('keydown', primeAudio, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
  document.addEventListener('dailyfifty:cloud-progress', (event) => { void applyCloudProgress(event.detail); });
  window.addEventListener('beforeunload', saveSession);
  document.addEventListener('fullscreenchange', () => elements.focusButton.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement))));
  window.addEventListener('resize', syncCalculatorOrientation);
}

async function init() {
  try {
    migrateLegacyStorage();
    state.date = localDate();
    state.completed = new Set(readIdArray(STORAGE.completed));
    state.blocked = new Set(readIdArray(STORAGE.blocked));
    state.seen = new Set(readIdArray(STORAGE.seen));
    cacheElements();
    bindEvents();
    restorePreferences();
    await start(false);
    startCloudSync();
  } catch (error) {
    console.error(error);
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Server returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw lastError || new Error('Network request failed.');
}

function setLoadingQuote(seed = state.index) {
  if (!elements.loadingMessage) return;
  elements.loadingMessage.textContent = LOADING_QUOTES[Math.abs(seed) % LOADING_QUOTES.length];
}

async function fetchIndex() {
  if (state.fullBuckets) return state.fullBuckets;
  const response = await fetchWithRetry(INDEX_URL, { cache: 'no-store' });
  const data = await parseResponse(response);
  if (!data?.buckets) throw new Error('The static question index is unavailable.');
  state.fullBuckets = data.buckets;
  return state.fullBuckets;
}


function rotateDailyBuckets(buckets,date){
  let hash=2166136261;
  for(const ch of String(date||'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
  const rotate=(values,salt)=>{const list=[...(values||[])];if(list.length<2)return list;const offset=Math.abs((hash^salt)>>>0)%list.length;return [...list.slice(offset),...list.slice(0,offset)]};
  return Object.fromEntries(Object.entries(buckets||{}).map(([key,value],index)=>[key,rotate(value,index*2654435761)]));
}

async function createPlan() {
  const buckets = await fetchIndex();
  const excluded = [...new Set([...state.completed, ...state.seen])];
  return buildOrderedPlan(rotateDailyBuckets(buckets, state.date), { completed: excluded, blocked: [...state.blocked] });
}

async function start(forceNew) {
  const sequence = ++state.startSequence;
  stopTimer();
  state.loadController?.abort();
  state.loadingQuestion = false;
  hideError();

  const saved = forceNew ? null : readJson(STORAGE.session, null);
  if (isValidSession(saved, state.date)) {
    state.plan = saved.plan;
    state.reserve = saved.reserve || {};
    state.answers = saved.answers || {};
    state.index = Math.min(49, Math.max(0, Number(saved.index) || 0));
  } else {
    const built = await createPlan();
    if (sequence !== state.startSequence) return;
    state.plan = built.plan;
    state.reserve = built.reserve;
    state.answers = {};
    state.index = 0;
    saveSession();
  }

  await repairExcludedQuestions();
  renderNavigator();
  updateProgress();
  await loadCurrentQuestion();
}

function saveSession() {
  if (state.plan.length !== 50) return;
  writeJson(STORAGE.session, {
    date: state.date,
    planVersion: PLAN_VERSION,
    plan: state.plan,
    reserve: state.reserve,
    answers: state.answers,
    index: state.index,
    savedAt: new Date().toISOString(),
  });
}

function getAnswerState(id) {
  if (!state.answers[id]) {
    state.answers[id] = {
      selected: null,
      input: '',
      crossed: [],
      checked: false,
      revealed: false,
      result: null,
      timedOut: false,
      completed: state.completed.has(id),
      remaining: TIMER_SECONDS,
      overtimeSeconds: 0,
      deadline: null,
      seenAt: null,
      savedAt: null,
    };
  }
  return state.answers[id];
}

function currentItem() {
  return state.plan[state.index] || null;
}


function readPrefetchedQuestion(id) {
  try {
    const raw = sessionStorage.getItem(PREFETCH_PREFIX + id);
    if (!raw) return null;
    sessionStorage.removeItem(PREFETCH_PREFIX + id);
    const question = JSON.parse(raw);
    return question?.valid ? question : null;
  } catch {
    return null;
  }
}

async function fetchQuestion(id, signal) {
  const response = await fetchWithRetry(`${API_URL}?id=${encodeURIComponent(id)}`, { signal, cache: 'no-store' });
  const data = await parseResponse(response);
  if (!data.ok || !data.question?.valid) throw new Error(data.error || 'Question unavailable.');
  return data.question;
}

async function loadCurrentQuestion(attempt = 0) {
  const item = currentItem();
  if (!item) throw new Error('The daily plan has no current question.');
  const sequence = ++state.loadSequence;
  state.loadingQuestion = true;
  stopTimer();
  state.loadController?.abort();
  const controller = new AbortController();
  state.loadController = controller;
  renderQuestionSkeleton(item);
  setLoadingQuote(state.index);
  const loadingDelay = state.hasRenderedQuestion
    ? null
    : window.setTimeout(() => elements.loadingOverlay.classList.remove('hidden'), 700);

  try {
    let question = state.questionCache.get(item.id) || readPrefetchedQuestion(item.id);
    if (!question) {
      question = await fetchQuestion(item.id, controller.signal);
      state.questionCache.set(item.id, question);
    }
    if (sequence !== state.loadSequence) return;
    markQuestionSeen(item);
    renderQuestion(question, item);
    if (loadingDelay) window.clearTimeout(loadingDelay);
    hideLoading();
    state.loadingQuestion = false;
    state.hasRenderedQuestion = true;
    startTimerForCurrent();
    rotateMusicForQuestion();
    void preloadNextQuestion();
    saveSession();
  } catch (error) {
    if (loadingDelay) window.clearTimeout(loadingDelay);
    hideLoading();
    if (error?.name === 'AbortError') return;
    state.blocked.add(item.id);
    writeJson(STORAGE.blocked, [...state.blocked]);
    const replaced = await replaceCurrentQuestion(item);
    if (replaced && attempt < 8) return loadCurrentQuestion(attempt + 1);
    state.loadingQuestion = false;
    throw error;
  }
}

async function replaceCurrentQuestion(failedItem) {
  const used = new Set(state.plan.map((item) => item.id));
  const reserve = Array.isArray(state.reserve[failedItem.bucket]) ? state.reserve[failedItem.bucket] : [];
  let candidate = null;
  while (reserve.length && !candidate) {
    const next = reserve.shift();
    if (next && !used.has(next.id) && !state.completed.has(next.id) && !state.blocked.has(next.id) && !state.seen.has(next.id)) candidate = next;
  }

  if (!candidate) {
    const pools = buildCandidatePools(await fetchIndex());
    candidate = (pools[failedItem.bucket] || []).find((item) => !used.has(item.id) && !state.completed.has(item.id) && !state.blocked.has(item.id) && !state.seen.has(item.id)) || null;
  }
  if (!candidate) return false;

  delete state.answers[failedItem.id];
  state.plan[state.index] = candidate;
  state.reserve[failedItem.bucket] = reserve;
  saveSession();
  showToast('A malformed question was replaced automatically.');
  return true;
}

function hasQuestionWork(answer) {
  if (!answer || typeof answer !== 'object') return false;
  return Boolean(
    answer.seenAt || answer.selected || String(answer.input || '').trim() || answer.checked ||
    answer.revealed || answer.completedAt || (answer.result !== null && answer.result !== undefined)
  );
}

function markQuestionSeen(item) {
  const answer = getAnswerState(item.id);
  const now = new Date().toISOString();
  if (!answer.seenAt) answer.seenAt = now;
  answer.savedAt = now;
  if (!state.seen.has(item.id)) {
    state.seen.add(item.id);
    writeJson(STORAGE.seen, [...state.seen]);
  }
}

async function repairExcludedQuestions() {
  if (state.plan.length !== 50) return 0;
  const stale = state.plan
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (state.completed.has(item.id) || state.seen.has(item.id)) && !hasQuestionWork(state.answers[item.id]));
  if (!stale.length) return 0;

  const pools = buildCandidatePools(await fetchIndex());
  const used = new Set(state.plan.map((item) => item.id));
  let replacements = 0;
  for (const { item, index } of stale) {
    const reserve = Array.isArray(state.reserve[item.bucket]) ? state.reserve[item.bucket] : [];
    let candidate = null;
    while (reserve.length && !candidate) {
      const next = reserve.shift();
      if (next && !used.has(next.id) && !state.completed.has(next.id) && !state.blocked.has(next.id) && !state.seen.has(next.id)) candidate = next;
    }
    if (!candidate) {
      candidate = (pools[item.bucket] || []).find((next) =>
        !used.has(next.id) && !state.completed.has(next.id) && !state.blocked.has(next.id) && !state.seen.has(next.id)
      ) || null;
    }
    state.reserve[item.bucket] = reserve;
    if (!candidate) continue;
    used.delete(item.id);
    used.add(candidate.id);
    state.plan[index] = candidate;
    delete state.answers[item.id];
    replacements += 1;
  }
  if (replacements) saveSession();
  return replacements;
}

async function applyCloudProgress(payload) {
  if (!payload || typeof payload !== 'object') return;
  state.loadController?.abort();
  state.loadingQuestion = false;
  state.loadSequence += 1;
  const currentId = currentItem()?.id || null;
  state.completed = new Set(normalizeIds(payload.completed));
  state.blocked = new Set(normalizeIds(payload.blocked));
  state.seen = new Set(normalizeIds(payload.seen));

  const remoteSession = payload.session;
  if (isValidSession(remoteSession, state.date)) {
    state.plan = remoteSession.plan;
    state.reserve = remoteSession.reserve || {};
    state.answers = remoteSession.answers || {};
    const currentIndex = currentId ? state.plan.findIndex((item) => item.id === currentId) : -1;
    state.index = currentIndex >= 0 ? currentIndex : Math.min(49, Math.max(0, Number(remoteSession.index) || 0));
  }

  await repairExcludedQuestions();
  saveSession();
  renderNavigator();
  updateProgress();
  const item = currentItem();
  if (!item) return;
  const question = state.questionCache.get(item.id);
  if (question) {
    stopTimer();
    renderQuestion(question, item);
    startTimerForCurrent();
  } else if (!state.loadingQuestion) {
    await loadCurrentQuestion();
  }
}

function renderQuestionSkeleton(item) {
  elements.questionCard.innerHTML = '<div class="skeleton skeleton-title"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton short"></div>';
  elements.answerArea.innerHTML = '<div class="skeleton answer-skeleton"></div>'.repeat(4);
  elements.feedback.className = 'feedback hidden';
  elements.explanationCard.classList.add('hidden');
  elements.checkButton.disabled = true;
  elements.completeButton.disabled = true;
  elements.revealButton.disabled = true;
  updateHeader(item);
  updateNavigator();
}

function renderQuestion(question, item) {
  const answer = getAnswerState(item.id);
  elements.questionCard.innerHTML = `<div class="rich-content">${normalizeMathMarkup(question.stemHtml)}</div>`;
  elements.skillLabel.textContent = question.heading || 'SAT practice';
  if (question.responseType === 'grid-in') renderGridIn(question, answer);
  else renderChoices(question, answer);
  renderFeedback(question, answer);
  renderExplanation(question, answer);
  syncButtons(question, answer);
  updateHeader(item);
  updateNavigator();
  updateProgress();
}

function renderChoices(question, answer) {
  elements.answerArea.replaceChildren();
  const locked = answer.revealed || answer.completed;
  for (const choice of question.choices) {
    const row = document.createElement('div');
    row.className = 'choice';
    if (answer.selected === choice.id) row.classList.add('selected');
    if (answer.crossed.includes(choice.id)) row.classList.add('crossed');
    if (answer.revealed && choice.id === question.correctChoice) row.classList.add('correct');
    if (answer.checked && answer.selected === choice.id && choice.id !== question.correctChoice) row.classList.add('incorrect');

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'choice-select';
    select.disabled = locked;
    select.setAttribute('aria-label', `Choose answer ${choice.letter}`);
    select.innerHTML = `<span class="choice-letter">${choice.letter}</span><span class="choice-content">${normalizeChoiceMarkup(choice.html)}</span>`;
    select.addEventListener('click', () => {
      answer.selected = choice.id;
      answer.checked = false;
      answer.result = null;
      saveSession();
      renderQuestion(question, currentItem());
    });

    const cross = document.createElement('button');
    cross.type = 'button';
    cross.className = 'cross-button';
    cross.disabled = locked;
    cross.textContent = '✕';
    cross.setAttribute('aria-label', `Cross out answer ${choice.letter}`);
    cross.addEventListener('click', () => {
      const crossed = new Set(answer.crossed);
      crossed.has(choice.id) ? crossed.delete(choice.id) : crossed.add(choice.id);
      answer.crossed = [...crossed];
      saveSession();
      renderQuestion(question, currentItem());
    });
    row.append(select, cross);
    elements.answerArea.appendChild(row);
  }
}

function escapeAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderGridIn(question, answer) {
  const locked = answer.revealed || answer.completed;
  elements.answerArea.innerHTML = `<div class="grid-in-wrap"><label for="gridInInput">Enter your answer</label><input id="gridInInput" class="grid-in" inputmode="decimal" autocomplete="off" spellcheck="false" value="${escapeAttribute(answer.input)}" placeholder="Example: 3/17 or 0.176" ${locked ? 'disabled' : ''}/><p class="grid-in-help">SAT-style equivalents are accepted: fractions, decimals, leading-decimal notation, percentages, and properly rounded repeating decimals.</p></div>`;
  const input = document.getElementById('gridInInput');
  input?.addEventListener('input', () => {
    answer.input = input.value;
    answer.checked = false;
    answer.result = null;
    saveSession();
    syncButtons(question, answer);
  });
}

function checkAnswer() {
  const item = currentItem();
  const question = item && state.questionCache.get(item.id);
  if (!item || !question) return;
  const answer = getAnswerState(item.id);
  if (answer.revealed || answer.completed) return;
  if (question.responseType === 'grid-in') {
    if (!answer.input.trim()) return;
    answer.result = gridInMatches(answer.input, question.acceptedAnswers?.length ? question.acceptedAnswers : question.correctText);
  } else {
    if (!answer.selected) return;
    answer.result = answer.selected === question.correctChoice;
  }
  answer.checked = true;
  answer.revealed = true;
  answer.deadline = null;
  stopTimer();
  if (answer.result) void celebrateCorrect();
  else void playOutcomeSound('incorrect');
  saveSession();
  renderQuestion(question, item);
}

function revealAnswer(reason) {
  const item = currentItem();
  const question = item && state.questionCache.get(item.id);
  if (!item || !question) return;
  const answer = getAnswerState(item.id);
  if (answer.completed) return;
  answer.revealed = true;
  answer.timedOut = reason === 'timeout' || answer.timedOut;
  answer.deadline = null;
  stopTimer();
  saveSession();
  renderQuestion(question, item);
}

function completeCurrentQuestion() {
  const item = currentItem();
  const question = item && state.questionCache.get(item.id);
  if (!item || !question) return;
  const answer = getAnswerState(item.id);
  if (!answer.revealed || answer.completed) return;
  answer.completed = true;
  answer.completedAt = new Date().toISOString();
  state.completed.add(item.id);
  writeJson(STORAGE.completed, [...state.completed]);
  playChime('complete');
  saveSession();
  const next = nextIncompleteIndex(state.plan, state.answers, state.index + 1);
  if (next === -1) {
    showToast('Daily Fifty complete. Your brain has earned confetti. ✦', 5000);
    renderQuestion(question, item);
    return;
  }
  state.index = next;
  void loadCurrentQuestion().catch(handleFatalError);
}

function renderFeedback(question, answer) {
  if (!answer.revealed) {
    elements.feedback.className = 'feedback hidden';
    elements.feedback.textContent = '';
    return;
  }
  if (answer.timedOut && !answer.checked) {
    elements.feedback.className = 'feedback timeout';
    elements.feedback.textContent = 'You went overtime. The answer is shown because you chose to reveal it; mark the question complete when ready.';
  } else if (answer.checked && answer.result) {
    elements.feedback.className = 'feedback correct';
    elements.feedback.textContent = answer.encouragement || 'Correct. Nice clean strike.';
  } else if (answer.checked) {
    elements.feedback.className = 'feedback incorrect';
    elements.feedback.textContent = question.correctLetter ? `Not quite. The correct choice is ${question.correctLetter}.` : `Not quite. A correct response is ${question.correctText}.`;
  } else {
    elements.feedback.className = 'feedback timeout';
    elements.feedback.textContent = question.correctLetter ? `The correct choice is ${question.correctLetter}.` : `A correct response is ${question.correctText}.`;
  }
}

function renderExplanation(question, answer) {
  if (!answer.revealed) {
    elements.explanationCard.classList.add('hidden');
    elements.explanationContent.replaceChildren();
    return;
  }
  elements.explanationContent.innerHTML = normalizeMathMarkup(question.rationaleHtml);
  elements.explanationCard.classList.remove('hidden');
}

function syncButtons(question, answer) {
  const hasResponse = question.responseType === 'grid-in' ? Boolean(answer.input.trim()) : Boolean(answer.selected);
  elements.checkButton.disabled = !hasResponse || answer.revealed || answer.completed;
  elements.revealButton.disabled = answer.revealed || answer.completed;
  elements.completeButton.disabled = !answer.revealed || answer.completed;
  elements.completeButton.textContent = answer.completed ? 'Question retired ✓' : 'Mark complete and retire question';
}

function navigateRelative(direction) {
  if (state.loadingQuestion || state.plan.length !== 50) return;
  state.index = (state.index + direction + 50) % 50;
  void loadCurrentQuestion().catch(handleFatalError);
}

function navigateTo(index) {
  if (state.loadingQuestion || index === state.index || index < 0 || index >= 50) return;
  state.index = index;
  void loadCurrentQuestion().catch(handleFatalError);
}

function renderNavigator() {
  elements.questionNavigator.replaceChildren();
  state.plan.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-question';
    button.textContent = String(index + 1);
    button.title = `${item.subject} · ${item.difficulty}`;
    button.addEventListener('click', () => navigateTo(index));
    elements.questionNavigator.appendChild(button);
  });
  updateNavigator();
}

function updateNavigator() {
  [...elements.questionNavigator.children].forEach((button, index) => {
    const item = state.plan[index];
    const answer = item ? getAnswerState(item.id) : null;
    button.className = 'nav-question';
    if (answer?.checked) {
      if (answer.timedOut) button.classList.add(answer.result ? 'overtime-correct' : 'overtime-wrong');
      else button.classList.add(answer.result ? 'result-correct' : 'result-wrong');
    } else if (answer?.timedOut) {
      button.classList.add('timed-out');
    } else if (answer && (answer.selected || answer.input || answer.revealed)) {
      button.classList.add('answered');
    }
    if (answer?.completed) button.classList.add('completed');
    if (index === state.index) button.classList.add('current');
    const status = answer?.checked
      ? `${answer.result ? 'correct' : 'wrong'}${answer.timedOut ? ', overtime' : ''}`
      : answer?.timedOut ? 'overtime, not yet checked' : answer?.completed ? 'complete' : 'unanswered';
    button.setAttribute('aria-label', `Question ${index + 1}: ${status}`);
  });
}

function updateHeader(item) {
  elements.subjectBadge.className = `badge ${item.subject === 'Math' ? 'badge-math' : 'badge-reading'}`;
  elements.subjectBadge.textContent = item.subject;
  elements.difficultyBadge.className = `badge badge-${item.difficulty.toLowerCase()}`;
  elements.difficultyBadge.textContent = item.difficulty;
  elements.questionCounter.textContent = `${state.index + 1} / 50`;
  syncCalculator(item);
}

function isCalculatorStacked() {
  return window.matchMedia?.('(max-width: 820px)').matches ?? false;
}

function savePreferences() {
  writeJson(STORAGE.preferences, {
    musicEnabled: state.music.enabled,
    calculatorOpen: state.calculator.open,
    calculatorRatio: state.calculator.ratio,
  });
}

function syncCalculatorOrientation() {
  const stacked = isCalculatorStacked();
  elements.calculatorDivider.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
}

function syncCalculator(item = currentItem()) {
  const isMath = item?.subject === 'Math';
  const active = isMath && state.calculator.open;
  elements.calculatorButton.classList.toggle('hidden', !isMath);
  elements.calculatorButton.classList.toggle('active', active);
  elements.calculatorButton.setAttribute('aria-expanded', String(active));
  elements.calculatorButton.textContent = active ? 'Hide Desmos Calculator' : 'Desmos Calculator';
  elements.questionStage.classList.toggle('calculator-open', active);
  elements.calculatorPane.classList.toggle('hidden', !active);
  elements.calculatorDivider.classList.toggle('hidden', !active);
  elements.questionStage.style.setProperty('--question-pane', `${state.calculator.ratio}%`);
  elements.calculatorDivider.setAttribute('aria-valuenow', String(Math.round(state.calculator.ratio)));
  syncCalculatorOrientation();
  if (active && !state.calculator.loaded) {
    const source = elements.desmosFrame.dataset.src;
    if (source) elements.desmosFrame.src = source;
    state.calculator.loaded = true;
  }
}

function setCalculatorOpen(open) {
  state.calculator.open = Boolean(open);
  syncCalculator();
  savePreferences();
  if (state.calculator.open && currentItem()?.subject === 'Math') {
    window.setTimeout(() => elements.calculatorPane.focus?.({ preventScroll: true }), 0);
  } else {
    elements.calculatorButton.focus?.({ preventScroll: true });
  }
}

function toggleCalculator() {
  if (currentItem()?.subject !== 'Math') return;
  setCalculatorOpen(!state.calculator.open);
}

function applyCalculatorRatio(ratio) {
  state.calculator.ratio = clampCalculatorRatio(ratio);
  elements.questionStage.style.setProperty('--question-pane', `${state.calculator.ratio}%`);
  elements.calculatorDivider.setAttribute('aria-valuenow', String(Math.round(state.calculator.ratio)));
}

function startCalculatorResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  state.calculator.dragging = true;
  elements.questionStage.classList.add('calculator-resizing');
  elements.calculatorDivider.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    if (!state.calculator.dragging) return;
    applyCalculatorRatio(calculatorRatioFromPointer(moveEvent, elements.questionStage.getBoundingClientRect(), isCalculatorStacked()));
  };
  const stop = () => {
    state.calculator.dragging = false;
    elements.questionStage.classList.remove('calculator-resizing');
    elements.calculatorDivider.removeEventListener('pointermove', move);
    elements.calculatorDivider.removeEventListener('pointerup', stop);
    elements.calculatorDivider.removeEventListener('pointercancel', stop);
    savePreferences();
  };
  elements.calculatorDivider.addEventListener('pointermove', move);
  elements.calculatorDivider.addEventListener('pointerup', stop);
  elements.calculatorDivider.addEventListener('pointercancel', stop);
  move(event);
}

function handleCalculatorResizeKey(event) {
  const stacked = isCalculatorStacked();
  const decrease = stacked ? 'ArrowUp' : 'ArrowLeft';
  const increase = stacked ? 'ArrowDown' : 'ArrowRight';
  let next = null;
  if (event.key === decrease) next = state.calculator.ratio - 2;
  else if (event.key === increase) next = state.calculator.ratio + 2;
  else if (event.key === 'Home') next = 30;
  else if (event.key === 'End') next = 70;
  if (next === null) return;
  event.preventDefault();
  applyCalculatorRatio(next);
  savePreferences();
}

function updateProgress() {
  const completed = state.plan.reduce((count, item) => count + (getAnswerState(item.id).completed ? 1 : 0), 0);
  elements.progressLabel.textContent = `${completed} of 50 complete`;
  elements.progressBar.style.width = `${completed * 2}%`;
}

function startTimerForCurrent() {
  const item = currentItem();
  if (!item) return;
  const answer = getAnswerState(item.id);
  if (answer.completed || answer.revealed) {
    state.timerOvertime = Boolean(answer.timedOut);
    state.overtimeSeconds = Math.max(0, Number(answer.overtimeSeconds || 0));
    state.timerRemaining = Math.max(0, Number(answer.remaining ?? TIMER_SECONDS));
    updateTimerVisual();
    return;
  }
  const now = Date.now();
  const remaining = Math.max(0, Math.min(TIMER_SECONDS, Number(answer.remaining ?? TIMER_SECONDS)));
  answer.deadline = Number(answer.deadline) > 0 ? Number(answer.deadline) : now + remaining * 1000;
  updateTimerFromDeadline();
  state.timerInterval = window.setInterval(updateTimerFromDeadline, 250);
}

function updateTimerFromDeadline() {
  const item = currentItem();
  if (!item) return;
  const answer = getAnswerState(item.id);
  const delta = Number(answer.deadline) - Date.now();
  const overtime = delta < 0;
  const seconds = overtime ? Math.max(0, Math.floor(-delta / 1000)) : Math.max(0, Math.ceil(delta / 1000));
  state.timerOvertime = overtime;
  state.overtimeSeconds = overtime ? seconds : 0;
  state.timerRemaining = overtime ? 0 : seconds;
  answer.remaining = state.timerRemaining;
  answer.overtimeSeconds = state.overtimeSeconds;
  if (overtime && !answer.timedOut) {
    answer.timedOut = true;
    saveSession();
    void playOvertimeAlert();
    showToast('Time is up. Keep working, the answer stays hidden.', 3600);
  }
  updateTimerVisual();
  updateNavigator();
}

function stopTimer() {
  if (state.timerInterval) window.clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function updateTimerVisual() {
  const seconds = state.timerOvertime ? state.overtimeSeconds : state.timerRemaining;
  const minutes = Math.floor(seconds / 60);
  elements.timerText.textContent = state.timerOvertime ? `+${minutes}:${String(seconds % 60).padStart(2, '0')}` : String(seconds);
  elements.timerUnit.textContent = state.timerOvertime ? 'overtime' : 'seconds';
  const circumference = 2 * Math.PI * 18;
  const fraction = state.timerOvertime ? 0 : Math.max(0, Math.min(1, state.timerRemaining / TIMER_SECONDS));
  elements.timerRing.style.strokeDashoffset = String(circumference * (1 - fraction));
  elements.timerWrap.classList.toggle('warning', !state.timerOvertime && state.timerRemaining <= 20 && state.timerRemaining > 8);
  elements.timerWrap.classList.toggle('danger', !state.timerOvertime && state.timerRemaining <= 8);
  elements.timerWrap.classList.toggle('overtime', state.timerOvertime);
}

async function preloadNextQuestion() {
  const next = state.plan[(state.index + 1) % state.plan.length];
  if (!next || state.questionCache.has(next.id)) return;
  try {
    const question = await fetchQuestion(next.id);
    state.questionCache.set(next.id, question);
  } catch {
    // The normal loader handles validation and replacement.
  }
}

function handleKeyboard(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (typing && event.key !== 'Enter') return;
  const item = currentItem();
  const question = item && state.questionCache.get(item.id);
  if (!item || !question) return;
  const answer = getAnswerState(item.id);
  if (/^[1-4]$/.test(event.key) && question.responseType === 'multiple-choice' && !answer.revealed && !answer.completed) {
    const choice = question.choices[Number(event.key) - 1];
    if (choice) {
      answer.selected = choice.id;
      answer.checked = false;
      answer.result = null;
      saveSession();
      renderQuestion(question, item);
    }
  } else if (event.key === 'Enter' && !elements.checkButton.disabled) {
    event.preventDefault();
    checkAnswer();
  } else if (!typing && event.key.toLowerCase() === 'n') navigateRelative(1);
  else if (!typing && event.key.toLowerCase() === 'p') navigateRelative(-1);
}

function restorePreferences() {
  const preferences = readJson(STORAGE.preferences, {});
  state.music.enabled = Boolean(preferences.musicEnabled);
  state.calculator.open = Boolean(preferences.calculatorOpen);
  state.calculator.ratio = clampCalculatorRatio(preferences.calculatorRatio);
  updateMusicButton();
}

async function toggleMusic() {
  state.music.enabled = !state.music.enabled;
  savePreferences();
  if (state.music.enabled) await startMusic();
  else stopMusic();
  updateMusicButton();
}

function updateMusicButton() {
  elements.musicButton.setAttribute('aria-pressed', String(state.music.enabled));
  elements.musicLabel.textContent = state.music.enabled ? TRACKS[state.music.trackIndex].name : 'Music off';
}

async function startMusic() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    state.music.enabled = false;
    showToast('This browser does not support the focus synthesizer.');
    return;
  }
  if (!state.music.context) {
    state.music.context = new AudioContextClass();
    state.music.gain = state.music.context.createGain();
    state.music.gain.connect(state.music.context.destination);
  }
  if (state.music.context.state === 'suspended') await state.music.context.resume();
  state.music.gain.gain.cancelScheduledValues(state.music.context.currentTime);
  state.music.gain.gain.setTargetAtTime(0.035, state.music.context.currentTime, 0.03);
  if (state.music.interval) window.clearInterval(state.music.interval);
  state.music.step = 0;
  playMusicStep();
  state.music.interval = window.setInterval(playMusicStep, 460);
}

function stopMusic() {
  if (state.music.interval) window.clearInterval(state.music.interval);
  state.music.interval = null;
  if (state.music.gain && state.music.context) state.music.gain.gain.setTargetAtTime(0.0001, state.music.context.currentTime, 0.04);
}

function rotateMusicForQuestion() {
  state.music.trackIndex = state.index % TRACKS.length;
  updateMusicButton();
  if (state.music.enabled) void startMusic();
}

function playMusicStep() {
  if (!state.music.enabled || !state.music.context || !state.music.gain) return;
  const track = TRACKS[state.music.trackIndex];
  const frequency = track.root * Math.pow(2, track.pattern[state.music.step % track.pattern.length] / 12);
  const now = state.music.context.currentTime;
  const oscillator = state.music.context.createOscillator();
  const envelope = state.music.context.createGain();
  oscillator.type = track.wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.42, now + 0.025);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  oscillator.connect(envelope);
  envelope.connect(state.music.gain);
  oscillator.start(now);
  oscillator.stop(now + 0.38);
  state.music.step += 1;
}

async function ensureAlertAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.alertAudio.context) {
    state.alertAudio.context = new AudioContextClass();
    state.alertAudio.gain = state.alertAudio.context.createGain();
    state.alertAudio.gain.gain.value = 0.11;
    state.alertAudio.gain.connect(state.alertAudio.context.destination);
  }
  if (state.alertAudio.context.state === 'suspended') {
    try { await state.alertAudio.context.resume(); } catch { return null; }
  }
  return state.alertAudio;
}

async function playTonePattern(notes, { spacing = 0.09, duration = 0.2, wave = 'sine', volume = 0.65 } = {}) {
  const audio = await ensureAlertAudio();
  if (!audio || audio.context.state !== 'running') return;
  notes.forEach((frequency, index) => {
    const start = audio.context.currentTime + index * spacing;
    const oscillator = audio.context.createOscillator();
    const envelope = audio.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(audio.gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  });
}

async function playOvertimeAlert() {
  await playTonePattern([880, 659.25], { spacing: 0.16, duration: 0.2, volume: 0.7 });
  navigator.vibrate?.(90);
}

async function playOutcomeSound(type, seed = 0) {
  if (type === 'correct') {
    const notes = SUCCESS_NOTE_PATTERNS[Math.abs(seed) % SUCCESS_NOTE_PATTERNS.length];
    await playTonePattern(notes, { spacing: 0.075, duration: 0.18, volume: 0.62 });
  } else if (type === 'incorrect') {
    await playTonePattern([246.94, 220], { spacing: 0.11, duration: 0.18, wave: 'triangle', volume: 0.42 });
  } else if (type === 'complete') {
    await playTonePattern([392, 523.25, 659.25, 783.99], { spacing: 0.07, duration: 0.2, volume: 0.58 });
  }
}

function launchCelebration(variant, message) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = `celebration-layer celebration-${variant}`;
  layer.setAttribute('aria-hidden', 'true');

  const pop = document.createElement('div');
  pop.className = 'encouragement-pop';
  pop.textContent = message;
  layer.appendChild(pop);

  if (!reducedMotion) {
    const counts = { confetti: 28, sparkles: 18, comets: 14, rings: 5 };
    const count = counts[variant] || 20;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('i');
      particle.className = 'celebration-particle';
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
      const distance = variant === 'rings' ? 0 : 90 + Math.random() * 150;
      particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * distance - 40}px`);
      particle.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
      particle.style.setProperty('--delay', `${Math.random() * 0.16}s`);
      particle.style.setProperty('--size', `${6 + Math.random() * 9}px`);
      layer.appendChild(particle);
    }
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), reducedMotion ? 1100 : 1800);
}

async function celebrateCorrect() {
  const item = currentItem();
  if (!item) return;
  const answer = getAnswerState(item.id);
  const seed = state.celebrationCounter++ + state.index;
  const message = CORRECT_MESSAGES[seed % CORRECT_MESSAGES.length];
  const variant = CELEBRATION_VARIANTS[seed % CELEBRATION_VARIANTS.length];
  answer.encouragement = message;
  launchCelebration(variant, message);
  await playOutcomeSound('correct', seed);
}

function playChime(type) {
  if (!state.music.enabled || !state.music.context || !state.music.gain) return;
  const notes = type === 'correct' ? [523.25, 659.25, 783.99] : type === 'complete' ? [392, 523.25, 659.25, 783.99] : type === 'timeout' ? [330, 277] : [246.94, 220];
  notes.forEach((frequency, index) => {
    const now = state.music.context.currentTime + index * 0.09;
    const oscillator = state.music.context.createOscillator();
    const envelope = state.music.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.65, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(envelope);
    envelope.connect(state.music.gain);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  });
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    showToast('Fullscreen was blocked by the browser.');
  }
}

async function parseResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Server error (${response.status}).`);
  return data;
}

function hideLoading() { elements.loadingOverlay?.classList.add('hidden'); }
function showError(message) { stopTimer(); hideLoading(); elements.errorMessage.textContent = /load failed|network|fetch/i.test(String(message)) ? 'The connection blinked. Your progress is safe. Tap retry.' : message; elements.errorOverlay.classList.remove('hidden'); }
function hideError() { elements.errorOverlay?.classList.add('hidden'); }
function handleFatalError(error) { console.error(error); showError(error instanceof Error ? error.message : String(error)); }
function showToast(message, duration = 2800) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => elements.toast.classList.add('hidden'), duration);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
else void init();
// Legacy migration is intentionally inert. No-repeat repair now runs inside the live state
// machine, which avoids writing a stale snapshot and reloading the page underneath the user.
if (false) (()=>{
  const KEYS={session:'dailyFifty.session.v4',completed:'dailyFifty.completed.v4',blocked:'dailyFifty.blocked.v4'};
  const read=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const validId=id=>/^[0-9a-f]{8}$/i.test(String(id||''));
  const lower=id=>String(id||'').toLowerCase();
  const hasCurrentWork=answer=>{
    if(!answer||typeof answer!=='object')return false;
    return Boolean(
      answer.selected||String(answer.input||'').trim()||answer.checked||answer.revealed||
      answer.completedAt||(answer.result!==null&&answer.result!==undefined)
    );
  };
  const makeItem=(id,bucket,buckets)=>{
    if(bucket==='math_hard')return{id,subject:'Math',difficulty:'Hard',bucket,skill:null};
    if(bucket==='rw_vocab'){
      const easy=new Set(buckets.rw_easy||[]),medium=new Set(buckets.rw_medium||[]);
      return{id,subject:'Reading & Writing',difficulty:easy.has(id)?'Easy':medium.has(id)?'Medium':'Hard',bucket,skill:'Words in Context'};
    }
    return{id,subject:'Reading & Writing',difficulty:'Hard',bucket:'rw_hard',skill:null};
  };
  const retiredSets=()=>({
    completed:new Set((read(KEYS.completed,[])||[]).filter(validId).map(lower)),
    blocked:new Set((read(KEYS.blocked,[])||[]).filter(validId).map(lower))
  });
  const staleIndexes=(session,completed)=>{
    const answers=session.answers&&typeof session.answers==='object'?session.answers:{};
    const stale=[];
    session.plan.forEach((item,index)=>{
      const id=lower(item?.id);
      if(completed.has(id)&&!hasCurrentWork(answers[id]))stale.push(index);
    });
    return stale;
  };
  const usableSession=value=>value&&Array.isArray(value.plan)&&value.plan.length===50?value:null;
  // A plan item from an older build can carry a bucket this addon does not source (rw_easy, or
  // none at all). Falling back keeps one odd item from abandoning the whole repair.
  const poolNameFor=(item,sources)=>{
    const bucket=String(item?.bucket||'');
    if(Array.isArray(sources[bucket])&&sources[bucket].length)return bucket;
    return /math/i.test(`${item?.subject||''} ${bucket}`)?'math_hard':'rw_hard';
  };
  // Everything below runs synchronously against a freshly read session. The previous version
  // read the session, awaited a network request for up to 20s, then wrote the stale snapshot
  // back, discarding every answer the running app had saved in the meantime.
  const applyRepair=payload=>{
    const session=usableSession(read(KEYS.session,null));
    if(!session)return 0;
    const {completed,blocked}=retiredSets();
    const stale=staleIndexes(session,completed);
    if(!stale.length)return 0;
    const answers=session.answers&&typeof session.answers==='object'?session.answers:{};
    const buckets=payload?.buckets||{};
    const vocabSet=new Set((buckets.rw_vocab||[]).map(lower));
    const sources={
      rw_vocab:(buckets.rw_vocab||[]).map(lower),
      rw_hard:(buckets.rw_hard||[]).map(lower).filter(id=>!vocabSet.has(id)),
      math_hard:(buckets.math_hard||[]).map(lower)
    };
    const staleSet=new Set(stale);
    const used=new Set(session.plan.map((item,index)=>staleSet.has(index)?null:lower(item?.id)).filter(Boolean));
    let replaced=0;
    for(const index of stale){
      const old=session.plan[index];
      const pool=sources[poolNameFor(old,sources)]||[];
      const next=pool.find(id=>validId(id)&&!completed.has(id)&&!blocked.has(id)&&!used.has(id));
      if(!next){console.warn(`No unseen replacement remains for ${old?.bucket||'this question'}.`);continue}
      const oldId=lower(old?.id);
      session.plan[index]=makeItem(next,poolNameFor(old,sources),buckets);
      used.add(next);
      if(!hasCurrentWork(answers[oldId]))delete answers[oldId];
      replaced+=1;
    }
    if(!replaced)return 0;
    session.answers=answers;
    const reserve={rw_vocab:[],rw_hard:[],math_hard:[]};
    for(const bucket of Object.keys(reserve)){
      for(const id of sources[bucket]){
        if(reserve[bucket].length>=12)break;
        if(completed.has(id)||blocked.has(id)||used.has(id))continue;
        reserve[bucket].push(makeItem(id,bucket,buckets));
        used.add(id);
      }
    }
    session.reserve=reserve;
    session.savedAt=new Date().toISOString();
    localStorage.setItem(KEYS.session,JSON.stringify(session));
    return replaced;
  };
  async function repair(){
    const session=usableSession(read(KEYS.session,null));
    if(!session)return;
    if(!staleIndexes(session,retiredSets().completed).length)return;
    const response=await fetch('/api/index',{cache:'no-store'});
    if(!response.ok)throw new Error(`Question index returned ${response.status}.`);
    const payload=await response.json();
    const replaced=applyRepair(payload);
    if(!replaced)return;
    sessionStorage.setItem('dailyFifty.retiredRepairNotice',String(replaced));
    document.dispatchEvent(new CustomEvent('dailyfifty:legacy-repair'));
  }
  const showNotice=()=>{
    let count=0;try{count=Number(sessionStorage.getItem('dailyFifty.retiredRepairNotice')||0);sessionStorage.removeItem('dailyFifty.retiredRepairNotice')}catch{}
    if(!count)return;
    const toast=document.getElementById('toast');
    if(!toast)return;
    toast.textContent=`Replaced ${count} retired question${count===1?'':'s'} with unseen ones. Your completed work was preserved.`;
    toast.classList.remove('hidden');
    setTimeout(()=>toast.classList.add('hidden'),4200);
  };
  const start=()=>{setTimeout(showNotice,700);setTimeout(()=>repair().catch(error=>console.warn('Could not replace retired questions.',error)),1200)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
