export const CALCULATOR_MIN_RATIO = 30;
export const CALCULATOR_MAX_RATIO = 70;
export const CALCULATOR_DEFAULT_RATIO = 50;
export const QUESTION_PANE_MIN_PX = 500;
export const CALCULATOR_PANE_MIN_PX = 420;
export const CALCULATOR_DIVIDER_PX = 14;

export function calculatorRatioBounds(rect, stacked = false) {
  if (stacked) return { min: CALCULATOR_MIN_RATIO, max: CALCULATOR_MAX_RATIO };

  const width = Number(rect?.width);
  if (!Number.isFinite(width) || width <= CALCULATOR_DIVIDER_PX) {
    return { min: CALCULATOR_MIN_RATIO, max: CALCULATOR_MAX_RATIO };
  }

  const available = width - CALCULATOR_DIVIDER_PX;
  const pixelMin = (QUESTION_PANE_MIN_PX / available) * 100;
  const pixelMax = 100 - (CALCULATOR_PANE_MIN_PX / available) * 100;
  const min = Math.max(CALCULATOR_MIN_RATIO, pixelMin);
  const max = Math.min(CALCULATOR_MAX_RATIO, pixelMax);

  if (min > max) return { min: CALCULATOR_DEFAULT_RATIO, max: CALCULATOR_DEFAULT_RATIO };
  return { min, max };
}

export function clampCalculatorRatio(value, bounds = null) {
  const number = Number(value);
  const fallback = Number.isFinite(number) ? number : CALCULATOR_DEFAULT_RATIO;
  const min = Number.isFinite(Number(bounds?.min)) ? Number(bounds.min) : CALCULATOR_MIN_RATIO;
  const max = Number.isFinite(Number(bounds?.max)) ? Number(bounds.max) : CALCULATOR_MAX_RATIO;
  return Math.min(max, Math.max(min, fallback));
}

export function calculatorRatioFromPointer(point, rect, stacked = false) {
  const start = stacked ? Number(rect?.top) : Number(rect?.left);
  const size = stacked ? Number(rect?.height) : Number(rect?.width);
  const position = stacked ? Number(point?.clientY) : Number(point?.clientX);
  if (!Number.isFinite(start) || !Number.isFinite(size) || size <= 0 || !Number.isFinite(position)) {
    return CALCULATOR_DEFAULT_RATIO;
  }
  return clampCalculatorRatio(((position - start) / size) * 100, calculatorRatioBounds(rect, stacked));
}
