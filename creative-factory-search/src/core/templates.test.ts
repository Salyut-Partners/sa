import { describe, expect, it } from 'vitest';
import { LOCALE_IDS, newLocale } from './locales.ts';
import { amountOf, counterFor } from './money.ts';
import { phrase } from './phrasebook.ts';
import {
  fieldEdited, fieldText, fieldValue, TEMPLATES, templateById, templateFields, templateMoves,
} from './templates.ts';
import type { Locale, LocaleId } from './types.ts';

// Read off the release list rather than written out again. A tenth language
// added to one list and forgotten in the other would leave this suite passing
// while the new locale opened every template with blank boxes.
const ALL_LOCALES: readonly LocaleId[] = LOCALE_IDS;

describe('the template library', () => {
  it('carries every record the library is meant to offer', () => {
    // Named rather than counted: an id is what the model, the renderer and a
    // saved project all agree on, so a rename has to be a decision here and not
    // a number that still adds up.
    expect(TEMPLATES.map(t => t.id)).toEqual([
      'jobs-banner', 'jobs-card-pills', 'jobs-card-panel', 'jobs-card-sheet',
      'jobs-scrim', 'avia-strip', 'rates', 'donor-tiers', 'tier-rows', 'rate-slider',
      'news-tab', 'news-tv', 'news-box', 'headline-blocks', 'photo-panel',
      'verdict-pills', 'option-tiles', 'steps-card', 'gauge-swap',
      'notice-push', 'notice-alert', 'notice-bubble', 'guide-arc',
    ]);
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

  it('states the scrim offer in the card keys, so nothing is retyped to switch', () => {
    // Built by narrowing the card schema, which a typo would silently shorten
    // rather than break. Pinned to the keys the layout actually draws.
    const scrim = templateById('jobs-scrim')!;
    expect(scrim.schema.map(f => f.key)).toEqual([
      'eyebrow', 'headline', 'flag', 'age', 'audience',
      'rate', 'cur', 'unitTop', 'unitBot', 'perks', 'cta',
    ]);
    const card = templateById('jobs-card-panel')!;
    const labels = new Map(card.schema.map(f => [f.key, f.label]));
    for (const field of scrim.schema) expect(labels.get(field.key), field.key).toBe(field.label);
  });

  it('quotes every figure in the currency of the country it is going to', () => {
    // The failure this is here for is a copy-paste: a language added by pasting
    // the one above it and its money left alone, so a Swedish advert offers
    // euro. A reader notices the wrong currency before they read the offer.
    for (const id of ALL_LOCALES) {
      const symbol = String(phrase(id, 'cur'));
      expect(symbol, `${id}.cur`).not.toBe('');
      for (const row of phrase(id, 'rates') as string[]) {
        expect(row, `${id}.rates`).toContain(symbol);
      }
      for (const key of ['payMin', 'payRate', 'payMax']) {
        expect(String(phrase(id, key)), `${id}.${key}`).toContain(symbol);
      }
    }
  });

  it('gives every locale a pay scale that stands up on its own', () => {
    // The three slider figures are money, so they are the locale's own. What
    // has to hold in their place is that each set is coherent: the layout reads
    // them back as numbers to place the knob, so a figure it cannot take apart,
    // or a payment outside its own scale, is a slider pointing nowhere.
    for (const id of ALL_LOCALES) {
      const amount = (key: string): number | null => amountOf(String(phrase(id, key)));
      const min = amount('payMin');
      const rate = amount('payRate');
      const max = amount('payMax');
      for (const [key, value] of [['payMin', min], ['payRate', rate], ['payMax', max]] as const) {
        expect(value, `${id}.${key}`).not.toBeNull();
      }
      expect(min!, id).toBeLessThan(rate!);
      expect(rate!, id).toBeLessThan(max!);
      // Countable, too: the payment counts up as the knob travels, which means
      // being taken apart and re-spelled at every frame. A figure the counter
      // cannot read holds still — right, but not what this card was drawn for.
      expect(counterFor(String(phrase(id, 'payRate'))).value, id).toBe(rate);
    }
  });

  it('rests the knob at the same point on the scale in every language', () => {
    // Nine languages, one design. The figures differ because the money does,
    // but the picture was laid out once: a locale whose payment sat at the far
    // end of its own scale would be a different card, not a translated one.
    const restingAt = (id: LocaleId): number => {
      const at = (key: string): number => amountOf(String(phrase(id, key)))!;
      return (at('payRate') - at('payMin')) / (at('payMax') - at('payMin'));
    };
    for (const id of ALL_LOCALES) expect(restingAt(id), id).toBeCloseTo(restingAt('en'), 2);
  });

  it('states the strip in the donor keys, so nothing is retyped to switch', () => {
    // Narrowed from the donor schema, which a typo would silently shorten
    // rather than break. Pinned to the keys the layout actually draws.
    const strip = templateById('tier-rows')!;
    expect(strip.schema.map(f => f.key)).toEqual(['donorTiers', 'donorCta']);
    const donor = templateById('donor-tiers')!;
    const labels = new Map(donor.schema.map(f => [f.key, f.label]));
    for (const field of strip.schema) expect(labels.get(field.key), field.key).toBe(field.label);
  });

  it('lets only the layouts that carry no scrim be moved', () => {
    // Every other layout darkens the whole picture behind itself, so sliding it
    // drags the shading off one edge and leaves the other bare. The list is
    // named rather than counted: making a layout movable is a decision about
    // how it is drawn, and it should have to be made here too.
    expect(TEMPLATES.filter(t => t.movable === true).map(t => t.id))
      .toEqual(['tier-rows', 'news-tab', 'news-tv', 'news-box', 'verdict-pills', 'option-tiles', 'gauge-swap']);
    expect(templateMoves('tier-rows')).toBe(true);
    expect(templateMoves('donor-tiers')).toBe(false);
    // A layout this build no longer carries cannot be moved either: an offset
    // nothing can show is one nobody could undo.
    expect(templateMoves('no-such-template')).toBe(false);
  });

  it('holds the three card versions to one schema, as they are one offer in three layouts', () => {
    const cards = TEMPLATES.filter(t => t.id.startsWith('jobs-card'));
    expect(cards).toHaveLength(3);
    const keys = cards.map(c => c.schema.map(f => f.key).join(','));
    expect(new Set(keys).size).toBe(1);
  });

  it('holds the three news strips to one schema, as they are one strip in three looks', () => {
    const strips = TEMPLATES.filter(t => t.id.startsWith('news-'));
    expect(strips).toHaveLength(3);
    for (const strip of strips) {
      expect(strip.schema.map(f => f.key), strip.id).toEqual(['newsKicker', 'newsHead', 'newsSub']);
    }
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
      .toBe('£200 – 300\n£450 – 700\n£800 – 1,100');
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
