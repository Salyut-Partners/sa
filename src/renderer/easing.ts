// Easing curves. Pure functions of a 0..1 progress — nothing here may read a
// clock, or the headless frame walk would stop matching the preview.

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

export const easeOutBack = (x: number): number => {
  const c1 = 0.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
