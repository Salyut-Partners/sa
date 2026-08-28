import { describe, expect, it } from 'vitest';
import { phrase } from './phrasebook.ts';
import { TEMPLATES, templateById } from './templates.ts';
import type { LocaleId } from './types.ts';

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
