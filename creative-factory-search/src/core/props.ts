// The prop catalogue: the objects a creative can put on the photo, what each one
// is called, and the colour it was drawn in.
//
// It lives in the core for the reason the template catalogue does — the model
// has to know a prop exists to place one, and the core may not know about the
// DOM. The artwork itself is a file under `public/props`, reached by URL rather
// than carried in the model: a photo is the user's and belongs in the document,
// a prop is the library's and is the same bytes for everyone. That is also what
// keeps it out of the export POST body, which is already the largest thing the
// server is asked to swallow.

/**
 * What a prop is for. A closed set, so that adding a second trade is a decision
 * taken here rather than a string somebody typed into a record.
 */
export type PropCategory = 'jobs';

export const CATEGORY_LABELS: Record<PropCategory, string> = {
  jobs: 'Прибирання',
};

export interface PropInfo {
  id: string;
  /** What the catalogue calls it. */
  label: string;
  category: PropCategory;
  /**
   * The hue its coloured parts are drawn in, or null when it has none worth
   * turning — a chrome-and-black vacuum is grey in every language.
   *
   * Recolouring is a rotation, not a repaint: the artwork keeps its own light,
   * shade and detail, and only the hue moves. Which means the catalogue has to
   * say where each prop's hue starts, or a rotation lands somewhere different on
   * every prop. Measured off the artwork rather than guessed — it is the busiest
   * tenth of the hue circle among the pixels that carry any colour at all.
   */
  hue: number | null;
}

/**
 * Ten objects of the cleaning trade. Four of them are grey and stay grey; that
 * is recorded rather than hidden, because a prop that quietly ignores the colour
 * it was given is worse than one the panel says up front cannot take one.
 */
export const PROPS: readonly PropInfo[] = [
  { id: 'vacuum-canister', label: 'Пилосос', category: 'jobs', hue: null },
  { id: 'vacuum-stick', label: 'Вертикальний пилосос', category: 'jobs', hue: 265 },
  { id: 'steam-cleaner', label: 'Пароочисник', category: 'jobs', hue: null },
  { id: 'window-vac', label: 'Мийка вікон', category: 'jobs', hue: 45 },
  { id: 'mop-bucket', label: 'Швабра з відром', category: 'jobs', hue: 205 },
  { id: 'caddy', label: 'Набір для прибирання', category: 'jobs', hue: 55 },
  { id: 'broom-pan', label: 'Мітла із совком', category: 'jobs', hue: null },
  { id: 'floor-squeegee', label: 'Скребок для підлоги', category: 'jobs', hue: null },
  { id: 'scrub-brush', label: 'Щітка', category: 'jobs', hue: 45 },
  { id: 'iron', label: 'Праска', category: 'jobs', hue: 215 },
];

export const propById = (id: string): PropInfo | null =>
  PROPS.find(p => p.id === id) ?? null;

export const propsIn = (category: PropCategory): readonly PropInfo[] =>
  PROPS.filter(p => p.category === category);

/** Where the artwork is. One place, so the editor and the export agree on it. */
export const propImage = (id: string): string => `/props/${id}.png`;

/** Whether the prop has a colour a creative can move. */
export const tintable = (prop: PropInfo): boolean => prop.hue !== null;
