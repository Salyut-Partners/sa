// Fonts are self-hosted so the headless render never waits on a network font
// and never silently falls back to a system face mid-export.
export interface FontFace {
  id: string;
  label: string;
  family: string;
  weight: number;
  upper: boolean;
  /** Starting font size as a share of the button height, before fitting. */
  sizeRatio: number;
}

export const FONTS: Record<string, FontFace> = {
  anton: { id: 'anton', label: 'Anton', family: "'Anton',sans-serif", weight: 400, upper: true, sizeRatio: 0.70 },
  inter: { id: 'inter', label: 'Inter', family: "'Inter',sans-serif", weight: 800, upper: true, sizeRatio: 0.50 },
  nunito: { id: 'nunito', label: 'Nunito', family: "'Nunito',sans-serif", weight: 900, upper: true, sizeRatio: 0.55 },
};

export const fontById = (id: string): FontFace => FONTS[id] ?? FONTS['anton']!;
