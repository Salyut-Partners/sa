// Which coat the editor wears. A preference of the person, not of the project:
// it is never serialised into a project file, because a creative opened on
// someone else's machine should look like their editor, not like the one it was
// authored in.
//
// Nothing here reaches a Spec. The creatives themselves are artwork bound for an
// mp4 and are drawn identically in either theme — see the note at the top of
// editor.css about what keeps its own colours.
import { useCallback, useEffect, useState } from 'react';

/** What the user picked. `system` follows the OS and keeps following it. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** What that resolves to once the OS has been asked. Only this reaches the DOM. */
export type Theme = 'light' | 'dark';

const KEY = 'cfs-theme';
const QUERY = '(prefers-color-scheme: dark)';

/** The order the one button walks. System first: it is the default. */
const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export const nextChoice = (choice: ThemeChoice): ThemeChoice =>
  ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;

export const resolve = (choice: ThemeChoice, system: Theme): Theme =>
  choice === 'system' ? system : choice;

const isChoice = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark';

/**
 * Storage is wrapped rather than trusted: a browser set to block site data
 * throws on the property access itself, and a theme is not worth a blank editor.
 */
function readChoice(): ThemeChoice {
  try {
    const stored: unknown = localStorage.getItem(KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Nothing to do and nothing worth saying: the theme still applies for as
    // long as the tab is open, it just will not be remembered.
  }
}

const systemTheme = (): Theme => matchMedia(QUERY).matches ? 'dark' : 'light';

/** What the toggle says it is doing, in the words the header uses. */
export const themeLabel: Record<ThemeChoice, string> = {
  system: 'Тема: як у системі',
  light: 'Тема: світла',
  dark: 'Тема: темна',
};

export const themeIcon: Record<ThemeChoice, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export interface ThemeControl {
  choice: ThemeChoice;
  /** What is actually on screen — `choice`, with `system` answered. */
  theme: Theme;
  cycle: () => void;
}

/**
 * The theme, kept in step with three things that can each change it: the button,
 * the OS while the choice is `system`, and another tab of the same editor.
 */
export function useTheme(): ThemeControl {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const media = matchMedia(QUERY);
    const onChange = (): void => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === KEY && isChoice(e.newValue)) setChoice(e.newValue);
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  const theme = resolve(choice, system);

  // The inline script in index.html has already written this for the first
  // paint; from here on it is React's to keep current.
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const cycle = useCallback(() => {
    setChoice(current => {
      const next = nextChoice(current);
      writeChoice(next);
      return next;
    });
  }, []);

  return { choice, theme, cycle };
}
