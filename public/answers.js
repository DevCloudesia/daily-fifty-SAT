const MIN_REPEAT_DECIMAL_DIGITS = 3;

function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}

function normalizeRational(numerator, denominator) {
  if (denominator === 0n) return null;
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcdBigInt(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

export function normalizeAnswerText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[⁄∕]/g, '/')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/^\+/, '')
    .replace(/^(-?)\./, '$10.')
    .replace(/^(-?)0+(?=\d)/, '$1');
}

function parseDecimalRational(text) {
  const match = String(text).match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const integerPart = match[2] ?? '0';
  const fractionalPart = match[3] ?? match[4] ?? '';
  const denominator = 10n ** BigInt(fractionalPart.length);
  const numerator = sign * BigInt(`${integerPart}${fractionalPart}` || '0');
  const rational = normalizeRational(numerator, denominator);
  return rational && {
    ...rational,
    notation: fractionalPart.length ? 'decimal' : 'integer',
    decimalPlaces: fractionalPart.length,
    raw: text,
  };
}

function divideRationals(left, right) {
  if (!left || !right || right.numerator === 0n) return null;
  const rational = normalizeRational(left.numerator * right.denominator, left.denominator * right.numerator);
  return rational && { ...rational, notation: 'fraction', decimalPlaces: null };
}

function addRationals(left, right) {
  const rational = normalizeRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
  return rational && { ...rational, notation: 'mixed', decimalPlaces: null };
}

export function parseRationalAnswer(value) {
  let raw = String(value ?? '')
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/[⁄∕]/g, '/')
    .replace(/,/g, '');
  if (!raw) return null;

  const percent = /%$/.test(raw);
  if (percent) raw = raw.slice(0, -1).trim();

  const mixed = raw.match(/^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  let parsed;
  if (mixed) {
    const sign = mixed[1] === '-' ? -1n : 1n;
    const whole = normalizeRational(sign * BigInt(mixed[2]), 1n);
    const fraction = normalizeRational(sign * BigInt(mixed[3]), BigInt(mixed[4]));
    parsed = whole && fraction ? addRationals(whole, fraction) : null;
  } else {
    const slash = raw.indexOf('/');
    if (slash >= 0 && raw.indexOf('/', slash + 1) < 0) {
      const numerator = parseDecimalRational(raw.slice(0, slash).trim());
      const denominator = parseDecimalRational(raw.slice(slash + 1).trim());
      parsed = divideRationals(numerator, denominator);
    } else {
      parsed = parseDecimalRational(raw.replace(/\s+/g, ''));
    }
  }

  if (!parsed) return null;
  if (percent) {
    const rational = normalizeRational(parsed.numerator, parsed.denominator * 100n);
    if (!rational) return null;
    parsed = {
      ...rational,
      notation: 'percent',
      decimalPlaces: parsed.decimalPlaces == null ? 2 : parsed.decimalPlaces + 2,
    };
  }
  return parsed;
}

export function parseNumericAnswer(value) {
  const rational = parseRationalAnswer(value);
  return rational ? Number(rational.numerator) / Number(rational.denominator) : Number.NaN;
}

export function splitAcceptedAnswers(correctText) {
  if (Array.isArray(correctText)) {
    return correctText.flatMap(splitAcceptedAnswers).filter(Boolean);
  }
  return String(correctText || '')
    .split(/\s*(?:;|\bor\b|,(?!\d{3}\b))\s*/i)
    .map((value) => value.trim())
    .filter(Boolean);
}

function rationalsEqual(left, right) {
  return Boolean(left && right && left.numerator === right.numerator && left.denominator === right.denominator);
}

function toNumber(rational) {
  return Number(rational.numerator) / Number(rational.denominator);
}

function hasTerminatingDecimal(rational) {
  if (!rational) return false;
  let denominator = rational.denominator < 0n ? -rational.denominator : rational.denominator;
  while (denominator % 2n === 0n) denominator /= 2n;
  while (denominator % 5n === 0n) denominator /= 5n;
  return denominator === 1n;
}

function approximateDecimalMatch(left, right) {
  if (!left || !right) return false;
  // SAT rounding/truncation flexibility is only relevant for a value whose
  // exact decimal expansion repeats. Never turn a nearby value such as .499
  // into the exact terminating answer .5.
  if (hasTerminatingDecimal(left) && hasTerminatingDecimal(right)) return false;
  const decimalOperands = [left, right].filter((value) => ['decimal', 'percent'].includes(value.notation) && value.decimalPlaces >= MIN_REPEAT_DECIMAL_DIGITS);
  if (!decimalOperands.length) return false;
  const precision = Math.max(...decimalOperands.map((value) => value.decimalPlaces));
  const tolerance = 10 ** (-precision) + Number.EPSILON * 8;
  return Math.abs(toNumber(left) - toNumber(right)) <= tolerance;
}

function parseRange(candidate) {
  const text = String(candidate || '').trim().replace(/[−–—]/g, '-');
  let match = text.match(/^([[(])\s*([^,]+)\s*,\s*([^\])]+)\s*([\])])$/);
  if (match) {
    return {
      low: parseRationalAnswer(match[2]),
      high: parseRationalAnswer(match[3]),
      includeLow: match[1] === '[',
      includeHigh: match[4] === ']',
    };
  }
  match = text.match(/^(?:between\s+)?(.+?)\s+(?:and|to)\s+(.+)$/i);
  if (match) return { low: parseRationalAnswer(match[1]), high: parseRationalAnswer(match[2]), includeLow: true, includeHigh: true };
  match = text.match(/^(.+?)\s*(<|≤|<=)\s*[a-z]\s*(<|≤|<=)\s*(.+)$/i);
  if (match) return { low: parseRationalAnswer(match[1]), high: parseRationalAnswer(match[4]), includeLow: match[2] !== '<', includeHigh: match[3] !== '<' };
  return null;
}

function rangeContains(input, range) {
  if (!input || !range?.low || !range?.high) return false;
  const value = toNumber(input);
  const low = toNumber(range.low);
  const high = toNumber(range.high);
  return (range.includeLow ? value >= low : value > low) && (range.includeHigh ? value <= high : value < high);
}

export function gridInMatches(input, acceptedAnswers) {
  const inputText = normalizeAnswerText(input);
  if (!inputText) return false;
  const inputRational = parseRationalAnswer(input);
  const groups = Array.isArray(acceptedAnswers) ? acceptedAnswers : [acceptedAnswers];

  return groups.some((group) => {
    const wholeRange = parseRange(group);
    if (wholeRange && rangeContains(inputRational, wholeRange)) return true;
    return splitAcceptedAnswers(group).some((candidate) => {
      if (inputText === normalizeAnswerText(candidate)) return true;
      const range = parseRange(candidate);
      if (range && rangeContains(inputRational, range)) return true;
      const candidateRational = parseRationalAnswer(candidate);
      if (!inputRational || !candidateRational) return false;
      return rationalsEqual(inputRational, candidateRational) || approximateDecimalMatch(inputRational, candidateRational);
    });
  });
}
