// The niche a topic belongs to, guessed from its name. A topic comes off the
// platform with nothing to say which niche it is — the platform has no such
// field — and the launch needs it for one thing: a topic with no campaign of
// its own takes its niche's pixel. `NewEraVadimJobsEU` is jobs,
// `888VLADAutoLoansFR` is credits.
//
// The guess never invents a niche. It answers one of the options it was given
// or null — and a name that matches two niches is left to the buyer rather
// than decided by the order of a table.

/**
 * The words that mean a niche, by the option they belong to — the option's own
 * name, squashed. Several languages, because a topic name is written by the
 * buyer who launched it: `arbeit`, `praca`, `lavoro` are all jobs.
 */
const WORDS: Record<string, string[]> = {
  jobs: ['job', 'jobs', 'work', 'vacan', 'career', 'hiring', 'recruit', 'staff', 'employ', 'arbeit', 'trabajo', 'lavoro', 'praca', 'robota'],
  credits: ['credit', 'kredit', 'loan', 'lening', 'prestamo', 'prestito', 'pozyczk', 'mortgage', 'debt', 'refinanc'],
  ecommerce: ['ecom', 'commerce', 'shop', 'store', 'retail', 'product', 'sale', 'deal'],
  auto: ['auto', 'car', 'vehicle', 'kfz', 'voiture', 'coche'],
};

/** An option as a key: lower case, letters and digits only, so `E-commerce` and `ecommerce` are one word. */
const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The option that the name points at, or null when nothing does or two do.
 *
 * Matching is by substring, lower-cased: topic names run their words together
 * (`AImobNLtrap`, `NewEraArtemMAutoFR`), so there is nothing to split on.
 */
export function guessNiche(name: string, options: readonly string[]): string | null {
  const text = squash(name);
  if (text === '') return null;
  const hit = options.filter(option => {
    const key = squash(option);
    if (key === '') return false;
    return [key, ...(WORDS[key] ?? [])].some(word => text.includes(word));
  });
  return hit.length === 1 ? hit[0]! : null;
}
