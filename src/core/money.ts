// Reading a money figure out of a field, and writing other figures the same way.
//
// The figure is a string somebody typed — "3.532 €", "€3,532", "3 532 kr/mån" —
// and a creative that counts up to it has to print every step in that same
// spelling, or it flickers between two ways of writing its own price. So the
// field is taken apart once into what comes before the digits, the digits, and
// what comes after, and put back together at every step.
//
// It is here rather than in the renderer because it is arithmetic on a string
// with several ways to go wrong, and this is the half of the project that has
// tests. Nothing in it touches the DOM.

/**
 * Every digit in the text as one number, or nothing when there are none.
 *
 * Deliberately blunt: "10.000 €" is ten thousand, and which of a dot and a comma
 * a geo groups its thousands with is not something a caller asking "how much is
 * this" should have to know. A figure written with decimals reads high, which is
 * why the caller that needs to be sure uses `counterFor` instead.
 */
export function amountOf(text: string): number | null {
  const only = text.replace(/\D+/g, '');
  return only === '' ? null : Number(only);
}

export interface Counter {
  /** What the field says, or nothing when it cannot be taken apart. */
  value: number | null;
  /** Any number, written the way the field was written. */
  say: (n: number) => string;
}

/**
 * What separates thousands, in the places that separate them at all. A group is
 * three digits, so anything else between digits is not grouping and the figure
 * is left alone.
 */
// `\s` covers the non-breaking and narrow spaces several geos group with, so
// they are not spelled out here: an invisible character in a regex is a trap.
const FIGURE = /^(\D*)(\d[\d\s.,']*\d|\d)(\D*)$/u;

/**
 * Take a figure apart so it can be counted up to.
 *
 * A figure it cannot take apart holds still instead — a decimal, two different
 * separators, or no digits at all. Each of those would have to be re-spelled at
 * every step, and guessing wrong at the spelling of a price is worse than a
 * price that simply does not move.
 */
export function counterFor(text: string): Counter {
  const still: Counter = { value: null, say: () => text };
  const found = FIGURE.exec(text);
  if (found === null) return still;

  const [, prefix = '', body = '', suffix = ''] = found;
  const seps = new Set([...body].filter(c => c < '0' || c > '9'));
  if (seps.size > 1) return still;
  const sep = [...seps][0] ?? '';
  if (sep !== '' && !grouped(body, sep)) return still;

  const value = Number(sep === '' ? body : body.split(sep).join(''));
  if (!Number.isFinite(value)) return still;
  return { value, say: n => prefix + group(n, sep) + suffix };
}

const grouped = (body: string, sep: string): boolean =>
  new RegExp(`^\\d{1,3}(${sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{3})+$`, 'u').test(body);

function group(n: number, sep: string): string {
  const digits = String(Math.max(0, Math.round(n)));
  return sep === '' ? digits : digits.replace(/\B(?=(\d{3})+$)/g, sep);
}
