const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

const SPOKEN_SYMBOLS = new Map([
  ['blank', ''], ['comma', ','], ['period', '.'], ['full stop', '.'],
  ['semicolon', ';'], ['colon', ':'], ['question mark', '?'],
  ['exclamation point', '!'], ['exclamation mark', '!'], ['apostrophe', "'"],
  ['quotation mark', '"'], ['double quote', '"'], ['single quote', "'"],
  ['open parenthesis', '('], ['left parenthesis', '('],
  ['close parenthesis', ')'], ['right parenthesis', ')'],
  ['open bracket', '['], ['left bracket', '['], ['close bracket', ']'], ['right bracket', ']'],
  ['open brace', '{'], ['left brace', '{'], ['close brace', '}'], ['right brace', '}'],
  ['vertical bar', '|'], ['absolute value bar', '|'],
  ['slash', '/'], ['backslash', '\\'], ['hyphen', '-'], ['dash', '—'],
  ['en dash', '–'], ['em dash', '—'], ['ellipsis', '…'], ['plus sign', '+'],
  ['minus sign', '−'], ['equals sign', '='], ['less than sign', '<'],
  ['greater than sign', '>'], ['percent sign', '%'], ['ampersand', '&'],
  ['at sign', '@'], ['number sign', '#'], ['dollar sign', '$'],
  ['degree sign', '°'], ['multiplication sign', '×'], ['division sign', '÷'],
]);

function isElement(node) {
  return Boolean(node) && node.nodeType === 1;
}

function isAccessibilityOnly(node) {
  if (!isElement(node)) return false;
  const className = String(node.getAttribute('class') || '').toLowerCase();
  const style = String(node.getAttribute('style') || '').toLowerCase();
  const testId = String(node.getAttribute('data-testid') || '').toLowerCase();
  return className.includes('sr-only') || className.includes('screen-reader') ||
    className.includes('visually-hidden') || style.includes('clip:') ||
    style.includes('clip-path:') || testId.includes('screen-reader') ||
    testId.includes('sr-only') || node.getAttribute('data-sr-only') === 'true';
}

function adjacentElement(node, direction = 'previousSibling') {
  let sibling = node?.[direction] || null;
  while (sibling && sibling.nodeType === 3 && !String(sibling.textContent || '').trim()) sibling = sibling[direction];
  return isElement(sibling) ? sibling : null;
}

function inferFence(fenced, side) {
  const own = fenced.getAttribute(side);
  if (own !== null && own !== '') return own;

  const otherSide = side === 'open' ? 'close' : 'open';
  const other = fenced.getAttribute(otherSide);
  const math = fenced.closest('math');
  const label = String(math?.getAttribute('alttext') || math?.getAttribute('aria-label') || '').toLowerCase();
  const absoluteValue = label.includes('startabsolutevalue') || label.includes('endabsolutevalue') ||
    label.includes('absolute value');

  // The SAT source uses open="" close="|" for absolute values. An empty opening fence is
  // not intentional here. It is an upstream encoding quirk that otherwise turns 2|4-x| into
  // the incorrect expression 24-x|.
  if (absoluteValue && other === '|') return '|';
  if (own !== null) return own;
  return side === 'open' ? '(' : ')';
}

function replaceMfenced(root, documentRef) {
  for (const fenced of [...root.querySelectorAll('mfenced')]) {
    const row = documentRef.createElementNS(MATHML_NS, 'mrow');
    const open = inferFence(fenced, 'open');
    const close = inferFence(fenced, 'close');
    const separators = (fenced.getAttribute('separators') || ',').replace(/\s+/g, '') || ',';
    const children = [...fenced.childNodes].filter((child) => child.nodeType !== 3 || child.textContent.trim() !== '');

    if (open) {
      const left = documentRef.createElementNS(MATHML_NS, 'mo');
      left.setAttribute('fence', 'true');
      left.setAttribute('stretchy', open === '|' ? 'true' : 'false');
      left.textContent = open;
      row.appendChild(left);
    }
    children.forEach((child, index) => {
      if (index > 0) {
        const separator = documentRef.createElementNS(MATHML_NS, 'mo');
        separator.setAttribute('separator', 'true');
        separator.textContent = separators[Math.min(index - 1, separators.length - 1)] || ',';
        row.appendChild(separator);
      }
      row.appendChild(child);
    });
    if (close) {
      const right = documentRef.createElementNS(MATHML_NS, 'mo');
      right.setAttribute('fence', 'true');
      right.setAttribute('stretchy', close === '|' ? 'true' : 'false');
      right.textContent = close;
      row.appendChild(right);
    }
    fenced.replaceWith(row);
  }
}

function normalizeSpokenLabels(root) {
  for (const node of [...root.querySelectorAll('span, i, b, em, strong')]) {
    const label = String(node.textContent || '').trim().toLowerCase().replace(/[.:;!?]+$/, '');
    if (!SPOKEN_SYMBOLS.has(label)) continue;
    const expected = SPOKEN_SYMBOLS.get(label);
    const previous = adjacentElement(node, 'previousSibling');
    const next = adjacentElement(node, 'nextSibling');
    const visible = [previous, next].find((candidate) => {
      const text = String(candidate?.textContent || '').trim();
      return candidate?.getAttribute('aria-hidden') === 'true' || /^_+$/.test(text) || text === expected;
    });
    if (!isAccessibilityOnly(node) && !visible) continue;
    if (visible) {
      visible.removeAttribute('aria-hidden');
      if (!visible.getAttribute('aria-label')) visible.setAttribute('aria-label', label);
    }
    node.remove();
  }

  const selector = [
    '.sr-only', '.visually-hidden', '.screen-reader-only', '.screen-reader-text',
    '[class*="sr-only"]', '[class*="visually-hidden"]', '[class*="screen-reader"]', '[data-sr-only="true"]',
  ].join(',');
  for (const node of [...root.querySelectorAll(selector)]) {
    const visible = adjacentElement(node, 'previousSibling') || adjacentElement(node, 'nextSibling');
    const label = String(node.textContent || '').trim();
    if (visible && label) {
      visible.removeAttribute('aria-hidden');
      if (!visible.getAttribute('aria-label')) visible.setAttribute('aria-label', label);
    }
    node.remove();
  }
}

export function normalizeMathMarkup(html, documentRef = document) {
  const container = documentRef.createElement('div');
  container.innerHTML = String(html || '');
  replaceMfenced(container, documentRef);
  normalizeSpokenLabels(container);

  for (const math of container.querySelectorAll('math')) {
    const label = math.getAttribute('alttext');
    if (label && !math.getAttribute('aria-label')) math.setAttribute('aria-label', label);
  }
  return container.innerHTML;
}

export function normalizeChoiceMarkup(html, documentRef = document) {
  const normalized = normalizeMathMarkup(html, documentRef);
  const container = documentRef.createElement('div');
  container.innerHTML = normalized;
  const text = String(container.textContent || '').trim().toLowerCase().replace(/[.:;!?]+$/, '');
  if (SPOKEN_SYMBOLS.has(text) && text !== 'blank') {
    const symbol = SPOKEN_SYMBOLS.get(text);
    return `<span class="df-punctuation-choice" aria-label="${text}">${symbol}</span>`;
  }
  return normalized;
}
