export const CALCULATOR_MIN_RATIO = 30;
export const CALCULATOR_MAX_RATIO = 70;
export const CALCULATOR_DEFAULT_RATIO = 56;

export function clampCalculatorRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return CALCULATOR_DEFAULT_RATIO;
  return Math.min(CALCULATOR_MAX_RATIO, Math.max(CALCULATOR_MIN_RATIO, number));
}

export function calculatorRatioFromPointer(point, rect, stacked = false) {
  const start = stacked ? Number(rect?.top) : Number(rect?.left);
  const size = stacked ? Number(rect?.height) : Number(rect?.width);
  const position = stacked ? Number(point?.clientY) : Number(point?.clientX);
  if (!Number.isFinite(start) || !Number.isFinite(size) || size <= 0 || !Number.isFinite(position)) {
    return CALCULATOR_DEFAULT_RATIO;
  }
  return clampCalculatorRatio(((position - start) / size) * 100);
}
