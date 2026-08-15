import {
  CALCULATOR_DEFAULT_RATIO,
  calculatorRatioBounds,
  calculatorRatioFromPointer,
  clampCalculatorRatio,
} from '/calculator-layout.js';

const STORAGE_KEY = 'dailyFifty.workspaceSplit.v2';
const STACKED_QUERY = '(max-width: 1000px)';

const state = {
  ratio: CALCULATOR_DEFAULT_RATIO,
  dragging: false,
};

const elements = {};

function readStoredRatio() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version !== 2) return CALCULATOR_DEFAULT_RATIO;
    return clampCalculatorRatio(saved.ratio);
  } catch {
    return CALCULATOR_DEFAULT_RATIO;
  }
}

function saveStoredRatio() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ratio: state.ratio }));
  } catch {
    // Layout still works without persisted preferences.
  }
}

function cacheElements() {
  const ids = [
    'practiceWorkspace',
    'studySplit',
    'questionStage',
    'workspaceDivider',
    'calculatorPane',
    'answerExplanationSlot',
    'workspaceExplanationSlot',
    'explanationCard',
  ];
  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Desmos workspace is missing #${id}.`);
    elements[id] = element;
  }
}

function isStacked() {
  return window.matchMedia?.(STACKED_QUERY).matches ?? false;
}

function calculatorIsOpen() {
  return elements.questionStage.classList.contains('calculator-open') &&
    !elements.calculatorPane.classList.contains('hidden');
}

function currentBounds() {
  return calculatorRatioBounds(elements.studySplit.getBoundingClientRect(), false);
}

function syncDividerAccessibility() {
  const open = calculatorIsOpen();
  const stacked = isStacked();
  const interactive = open && !stacked;
  elements.workspaceDivider.classList.toggle('hidden', !interactive);
  elements.workspaceDivider.tabIndex = interactive ? 0 : -1;
  elements.workspaceDivider.setAttribute('aria-hidden', String(!interactive));
  elements.workspaceDivider.setAttribute('aria-orientation', 'vertical');

  const bounds = currentBounds();
  elements.workspaceDivider.setAttribute('aria-valuemin', String(Math.ceil(bounds.min)));
  elements.workspaceDivider.setAttribute('aria-valuemax', String(Math.floor(bounds.max)));
  elements.workspaceDivider.setAttribute('aria-valuenow', String(Math.round(state.ratio)));
}

function applyRatio(value, { persist = false } = {}) {
  if (isStacked()) {
    state.ratio = clampCalculatorRatio(value);
  } else {
    state.ratio = clampCalculatorRatio(value, currentBounds());
  }
  elements.studySplit.style.setProperty('--workspace-question-pane', `${state.ratio}%`);
  syncDividerAccessibility();
  if (persist) saveStoredRatio();
}

function syncExplanationPlacement() {
  const embedded = calculatorIsOpen();
  const target = embedded ? elements.answerExplanationSlot : elements.workspaceExplanationSlot;
  if (elements.explanationCard.parentElement !== target) target.appendChild(elements.explanationCard);
  elements.explanationCard.classList.toggle('embedded', embedded);

  const visible = !elements.explanationCard.classList.contains('hidden');
  elements.answerExplanationSlot.classList.toggle('active', embedded && visible);
}

function syncWorkspaceMode() {
  const open = calculatorIsOpen();
  elements.practiceWorkspace.classList.toggle('calculator-open', open);
  if (open) applyRatio(state.ratio);
  else {
    elements.studySplit.classList.remove('workspace-resizing');
    state.dragging = false;
  }
  syncDividerAccessibility();
  syncExplanationPlacement();
}

function stopResize(pointerId = null) {
  if (!state.dragging) return;
  state.dragging = false;
  elements.studySplit.classList.remove('workspace-resizing');
  if (pointerId !== null) {
    try { elements.workspaceDivider.releasePointerCapture?.(pointerId); } catch {}
  }
  saveStoredRatio();
}

function startResize(event) {
  if (event.button !== 0 || isStacked() || !calculatorIsOpen()) return;
  event.preventDefault();
  state.dragging = true;
  elements.studySplit.classList.add('workspace-resizing');
  elements.workspaceDivider.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    if (!state.dragging) return;
    const ratio = calculatorRatioFromPointer(
      moveEvent,
      elements.studySplit.getBoundingClientRect(),
      false,
    );
    applyRatio(ratio);
  };

  const stop = (stopEvent) => {
    elements.workspaceDivider.removeEventListener('pointermove', move);
    elements.workspaceDivider.removeEventListener('pointerup', stop);
    elements.workspaceDivider.removeEventListener('pointercancel', stop);
    stopResize(stopEvent.pointerId);
  };

  elements.workspaceDivider.addEventListener('pointermove', move);
  elements.workspaceDivider.addEventListener('pointerup', stop);
  elements.workspaceDivider.addEventListener('pointercancel', stop);
  move(event);
}

function handleResizeKey(event) {
  if (isStacked() || !calculatorIsOpen()) return;
  const bounds = currentBounds();
  let next = null;
  if (event.key === 'ArrowLeft') next = state.ratio - 2;
  else if (event.key === 'ArrowRight') next = state.ratio + 2;
  else if (event.key === 'Home') next = bounds.min;
  else if (event.key === 'End') next = bounds.max;
  if (next === null) return;
  event.preventDefault();
  applyRatio(next, { persist: true });
}

function resetRatio() {
  if (isStacked() || !calculatorIsOpen()) return;
  applyRatio(CALCULATOR_DEFAULT_RATIO, { persist: true });
}

function bindEvents() {
  elements.workspaceDivider.addEventListener('pointerdown', startResize);
  elements.workspaceDivider.addEventListener('keydown', handleResizeKey);
  elements.workspaceDivider.addEventListener('dblclick', resetRatio);
  window.addEventListener('resize', () => {
    if (calculatorIsOpen() && !isStacked()) applyRatio(state.ratio);
    syncWorkspaceMode();
  });

  const modeObserver = new MutationObserver(syncWorkspaceMode);
  modeObserver.observe(elements.questionStage, { attributes: true, attributeFilter: ['class'] });
  modeObserver.observe(elements.calculatorPane, { attributes: true, attributeFilter: ['class'] });

  const explanationObserver = new MutationObserver(syncExplanationPlacement);
  explanationObserver.observe(elements.explanationCard, { attributes: true, attributeFilter: ['class'] });
}

function init() {
  cacheElements();
  state.ratio = readStoredRatio();
  bindEvents();
  applyRatio(state.ratio);
  syncWorkspaceMode();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
