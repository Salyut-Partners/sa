import { describe, expect, it } from 'vitest';
import { toPixels } from './canvas.ts';
import { visualKey } from './visual-key.ts';
import type { Spec } from './types.ts';

const CANVAS = { width: 1080, height: 1920 };

const spec = (over: Partial<Spec> = {}): Spec => ({
  canvas: { ...CANVAS },
  duration: 10,
  fps: 30,
  image: 'data:image/jpeg;base64,zz',
  pushIn: true,
  glare: true,
  template: null,
  buttons: [{
    styleId: 'glow',
    fontId: 'anton',
    text: 'ДІЗНАТИСЬ БІЛЬШЕ',
    color: '#1fa94b',
    rect: toPixels({ x: 10, y: 60, w: 70, h: 7 }, CANVAS),
    timing: { appearAt: 0, hideAt: null, enter: 'fade', enterDuration: 0.4 },
  }],
  props: [],
  locale: 'en',
  script: 'Airport staff wanted.',
  voiceId: 'george',
  modelId: 'eleven_multilingual_v2',
  ...over,
});

describe('visualKey', () => {
  it('gives two specs that look the same the same key', () => {
    expect(visualKey(spec())).toBe(visualKey(spec()));
  });

  it('does not depend on the order the spec was built in', () => {
    const a = spec();
    // The same values, assembled the other way round. A key that came out of
    // JSON.stringify over whatever order the fields happened to be in would
    // split a group the moment a spec arrived over the wire.
    const b: Spec = {
      modelId: a.modelId, voiceId: a.voiceId, script: a.script, locale: a.locale,
      props: a.props, buttons: a.buttons, template: a.template, glare: a.glare, pushIn: a.pushIn,
      image: a.image, fps: a.fps, duration: a.duration, canvas: a.canvas,
    };
    expect(visualKey(b)).toBe(visualKey(a));
  });

  describe('ignores the sound, which is what the dedup is for', () => {
    it('over the script', () => {
      expect(visualKey(spec({ script: 'Flughafenpersonal gesucht.' }))).toBe(visualKey(spec()));
    });

    it('over the voice and the model', () => {
      expect(visualKey(spec({ voiceId: 'lily', modelId: 'eleven_flash_v2_5' })))
        .toBe(visualKey(spec()));
    });

    it('over which language it is, once the words on the frame are the same', () => {
      // A creative with no template says the same thing in every language: one
      // video, seven soundtracks. That is the whole saving.
      expect(visualKey(spec({ locale: 'de' }))).toBe(visualKey(spec()));
    });
  });

  describe('separates anything that reaches the frame', () => {
    const differs = (over: Partial<Spec>): boolean => visualKey(spec(over)) !== visualKey(spec());

    it('the photo', () => expect(differs({ image: 'data:image/jpeg;base64,yy' })).toBe(true));
    it('the canvas', () => expect(differs({ canvas: { width: 540, height: 960 } })).toBe(true));
    it('the length', () => expect(differs({ duration: 12 })).toBe(true));
    it('the frame rate', () => expect(differs({ fps: 60 })).toBe(true));
    it('the push-in', () => expect(differs({ pushIn: false })).toBe(true));
    it('the glare', () => expect(differs({ glare: false })).toBe(true));

    it('a button that is not there', () => expect(differs({ buttons: [] })).toBe(true));

    it('what a button says', () => {
      const [b] = spec().buttons;
      expect(differs({ buttons: [{ ...b!, text: 'КУПИТИ' }] })).toBe(true);
    });

    it('where a button sits', () => {
      const [b] = spec().buttons;
      expect(differs({ buttons: [{ ...b!, rect: toPixels({ x: 11, y: 60, w: 70, h: 7 }, CANVAS) }] }))
        .toBe(true);
    });

    it('how a button looks', () => {
      const [b] = spec().buttons;
      expect(differs({ buttons: [{ ...b!, styleId: 'solid' }] })).toBe(true);
      expect(differs({ buttons: [{ ...b!, color: '#ff0000' }] })).toBe(true);
      expect(differs({ buttons: [{ ...b!, fontId: 'inter' }] })).toBe(true);
    });

    it('when a button is on screen', () => {
      const [b] = spec().buttons;
      expect(differs({ buttons: [{ ...b!, timing: { ...b!.timing, appearAt: 3 } }] })).toBe(true);
    });

    it('which button lies on top', () => {
      const [b] = spec().buttons;
      const two = [b!, { ...b!, text: 'ДРУГА' }];
      expect(visualKey(spec({ buttons: two })))
        .not.toBe(visualKey(spec({ buttons: [...two].reverse() })));
    });
  });

  describe('separates the template', () => {
    const withTemplate = (over: Partial<Spec['template'] & object> = {}): Spec =>
      spec({
        template: {
          definitionId: 'rates',
          fields: { ratesHead: 'Find this', rates: ['200 €', '500 €'] },
          color: '#1fa94b',
          offsetY: 0,
          timing: { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0.6 },
          ...over,
        },
      });

    it('by whether there is one at all', () => {
      expect(visualKey(withTemplate())).not.toBe(visualKey(spec()));
    });

    it('by which layout it is', () => {
      expect(visualKey(withTemplate({ definitionId: 'jobs-banner' })))
        .not.toBe(visualKey(withTemplate()));
    });

    it('by where on the frame it sits', () => {
      // Two photos alike but for the nudge are two pictures. Leaving it out of
      // the key would have them share one frame walk, and one of the two would
      // ship with the other's stack halfway up the photograph.
      expect(visualKey(withTemplate({ offsetY: -24 })))
        .not.toBe(visualKey(withTemplate()));
    });

    it('by what it says — a line and a list alike', () => {
      expect(visualKey(withTemplate({ fields: { ratesHead: 'Finde diesen', rates: ['200 €', '500 €'] } })))
        .not.toBe(visualKey(withTemplate()));
      expect(visualKey(withTemplate({ fields: { ratesHead: 'Find this', rates: ['200 €'] } })))
        .not.toBe(visualKey(withTemplate()));
    });

    it('but not by the order its fields were written in', () => {
      expect(visualKey(withTemplate({ fields: { rates: ['200 €', '500 €'], ratesHead: 'Find this' } })))
        .toBe(visualKey(withTemplate()));
    });

    it('by its colour and its window', () => {
      expect(visualKey(withTemplate({ color: '#ff0000' }))).not.toBe(visualKey(withTemplate()));
      expect(visualKey(withTemplate({
        timing: { appearAt: 2, hideAt: null, enter: 'none', enterDuration: 0.6 },
      }))).not.toBe(visualKey(withTemplate()));
    });
  });
});
