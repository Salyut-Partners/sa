import { describe, expect, it } from 'vitest';
import { newLocale } from './locales.ts';
import { phrase } from './phrasebook.ts';
import { fieldEdited, fieldText, fieldValue, TEMPLATES, templateById, templateFields } from './templates.ts';
import type { Locale, LocaleId } from './types.ts';

const ALL_LOCALES: LocaleId[] = ['en', 'de', 'it', 'es', 'fr', 'nl', 'pl'];

describe('the template library', () => {
  it('carries the five records the contract asks for', () => {
    expect(TEMPLATES).toHaveLength(5);
  });

  it('gives every template an id of its own', () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length);
  });

  it('finds a template by id and answers nothing for one it does not carry', () => {
    expect(templateById(TEMPLATES[0]!.id)?.label).toBe(TEMPLATES[0]!.label);
    expect(templateById('no-such-template')).toBeNull();
  });

  it('names each field once inside a schema', () => {
    for (const template of TEMPLATES) {
      const keys = template.schema.map(f => f.key);
      expect(new Set(keys).size, template.id).toBe(keys.length);
    }
  });

  it('has the phrase book answer every field of every template in every locale', () => {
    // The dictionary is what a template starts from. A field it is silent about
    // opens as a blank box, which is the one failure the library cannot show.
    for (const template of TEMPLATES) {
      for (const field of template.schema) {
        for (const locale of ALL_LOCALES) {
          expect(phrase(locale, field.key), `${template.id}.${field.key}/${locale}`)
            .not.toBeUndefined();
        }
      }
    }
  });

  it('holds the three card versions to one schema, as they are one offer in three layouts', () => {
    const cards = TEMPLATES.filter(t => t.id.startsWith('jobs-card'));
    expect(cards).toHaveLength(3);
    const keys = cards.map(c => c.schema.map(f => f.key).join(','));
    expect(new Set(keys).size).toBe(1);
  });
});

describe('what a field says', () => {
  const en = (overrides: Locale['overrides'] = {}): Locale => ({ ...newLocale('en'), overrides });
  const de = (overrides: Locale['overrides'] = {}): Locale => ({ ...newLocale('de'), overrides });

  it('says what the dictionary says when nobody has written over it', () => {
    expect(fieldValue(en(), 'cta')).toBe('LEARN MORE');
    expect(fieldValue(de(), 'cta')).toBe('MEHR ERFAHREN');
  });

  it('says what the user wrote over it', () => {
    expect(fieldValue(en({ cta: 'BUY NOW' }), 'cta')).toBe('BUY NOW');
  });

  it('keeps one language out of another, which is the whole point of the override', () => {
    // A German fix must not turn the English creative German.
    expect(fieldValue(en(), 'cta')).toBe('LEARN MORE');
    expect(fieldValue(de({ cta: 'JETZT' }), 'cta')).toBe('JETZT');
  });

  it('gives a blank of the field kind for a field the dictionary never heard of', () => {
    expect(fieldValue(en(), 'invented', 'line')).toBe('');
    expect(fieldValue(en(), 'invented', 'list')).toEqual([]);
  });

  it('reads the locale flag off the locale rather than out of a table of seven', () => {
    expect(fieldValue(de(), 'flag')).toBe('🇩🇪');
  });

  it('reads every kind as text for the box that edits it', () => {
    expect(fieldText(en(), { key: 'rates', label: '', kind: 'list' }))
      .toBe('200 – 300 €\n500 – 800 €\n900 – 1200 €');
  });

  it('says which fields were written by hand, so the dictionary ones can be told apart', () => {
    const locale = en({ cta: 'BUY NOW' });
    expect(fieldEdited(locale, 'cta')).toBe(true);
    expect(fieldEdited(locale, 'headline')).toBe(false);
  });
});

describe('templateFields', () => {
  const locale = (id: LocaleId, overrides: Locale['overrides'] = {}): Locale =>
    ({ ...newLocale(id), overrides });

  it('resolves every field of the schema and nothing else', () => {
    const fields = templateFields('rates', locale('en'));
    expect(Object.keys(fields).sort()).toEqual(['linkLine', 'rates', 'ratesAccent', 'ratesHead']);
  });

  it('leaves an override for a field of another template where it is', () => {
    // Swapping layouts must not cost the wording; it just stops being on screen.
    const held = locale('en', { disclaimer: 'дрібний шрифт' });
    expect('disclaimer' in templateFields('rates', held)).toBe(false);
    expect(templateFields('jobs-card-pills', held)['disclaimer']).toBe('дрібний шрифт');
  });

  it('answers with nothing for a template the library does not carry', () => {
    expect(templateFields('no-such-template', locale('en'))).toEqual({});
  });
});
