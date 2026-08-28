// The donor call: a two-line title, a short stack of claims, one pledge across a
// ribbon, and the age bands the offer is split into — each band with its own
// button.
//
// The bands are the point of the layout. A donor offer is the same offer at
// three ages, so the rows are near-identical by design and are told apart by one
// step of colour each, not by three unrelated hues: the accent belongs to the
// creative, and a row that ignored it would be the one thing on the frame the
// user's colour could not reach.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { BADGE_ICONS, esc, icon, items, line, seg } from './kit.ts';

/** When each band of the layout starts arriving. */
const BADGES_AT = 0.35;
const PLEDGE_AT = 0.75;
const TIERS_AT = 1.05;
/** The stagger inside a stack, and the span a long stack has to fit into. */
const TIERS_SPAN = 2.4;

/** The column everything is laid out in, inside the 1080-wide frame. */
const COLUMN = 952;

export function donorTiers({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const badges = items(spec, 'donorBadges');
  const tiers = items(spec, 'donorTiers');
  const cta = esc(line(spec, 'donorCta'));

  frame.innerHTML =
    '<div class="cf-t-tint cf-dn-scrims"></div>' +
    '<div class="cf-dn-head">' +
    `<span class="top">${esc(line(spec, 'donorTop'))}</span>` +
    `<span class="bot">${esc(line(spec, 'donorBottom'))}</span>` +
    '</div>' +
    '<div class="cf-dn-mid">' +
    '<div class="cf-dn-badges">' +
    badges.map((text, i) =>
      '<div class="cf-dn-badge">' +
      `<span class="ic">${icon(BADGE_ICONS[i % BADGE_ICONS.length]!, 46, '#fff')}</span>` +
      `<span class="tx">${esc(text)}</span>` +
      '</div>').join('') +
    '</div>' +
    '<div class="cf-dn-pledge">' +
    `<span class="ic">${icon('heart', 54, '#fff')}</span>` +
    '<span class="tx">' +
    `<span class="a">${esc(line(spec, 'donorPledge'))}</span>` +
    `<span class="b">${esc(line(spec, 'donorPledgeAccent'))}</span>` +
    '</span>' +
    '</div>' +
    '</div>' +
    '<div class="cf-dn-tiers">' +
    tiers.map(text =>
      '<div class="cf-dn-tier">' +
      `<span class="band"><span class="v">${esc(text)}</span></span>` +
      `<span class="go">${cta}</span>` +
      '</div>').join('') +
    '</div>';

  const scrims = frame.querySelector<HTMLElement>('.cf-dn-scrims')!;
  const head = frame.querySelector<HTMLElement>('.cf-dn-head')!;
  const mid = frame.querySelector<HTMLElement>('.cf-dn-mid')!;
  const pledge = frame.querySelector<HTMLElement>('.cf-dn-pledge')!;
  const stack = frame.querySelector<HTMLElement>('.cf-dn-tiers')!;
  const badgeEls = [...frame.querySelectorAll<HTMLElement>('.cf-dn-badge')];
  const tierEls = [...frame.querySelectorAll<HTMLElement>('.cf-dn-tier')];

  // The copy runs the full height here, so the scrim does too — darker at the
  // top and bottom, where the title and the bands sit.
  scrims.style.background =
    'linear-gradient(180deg,rgba(5,12,22,.86) 0%,rgba(5,12,22,.52) 26%,rgba(5,12,22,.34) 52%,' +
    'rgba(5,12,22,.72) 78%,rgba(5,12,22,.9) 100%)';

  head.querySelector<HTMLElement>('.top')!.style.color = a.lift(0.52);
  pledge.style.borderColor = a.lift(0.4);
  pledge.querySelector<HTMLElement>('.ic')!.style.background = a.base;
  pledge.querySelector<HTMLElement>('.b')!.style.color = a.lift(0.52);

  for (const badge of badgeEls) {
    badge.querySelector<HTMLElement>('.ic')!.style.background =
      `linear-gradient(160deg,${a.lift(0.28)},${a.dark(0.18)})`;
  }

  // One step of the accent per band, top to bottom. The ladder stays in the pale
  // half of the accent on purpose: the age sits on the band in dark ink, and a
  // rung dark enough to look striking is a rung the figure stops reading on.
  const rungs = Math.max(1, tierEls.length - 1);
  tierEls.forEach((tier, i) => {
    const k = 0.58 - 0.44 * (i / rungs);
    tier.querySelector<HTMLElement>('.band')!.style.background =
      `linear-gradient(96deg,${a.lift(k)},${a.lift(Math.max(0, k - 0.22))})`;
    const go = tier.querySelector<HTMLElement>('.go')!;
    go.style.background = `linear-gradient(180deg,${a.lift(0.2)},${a.dark(0.14)})`;
    go.style.boxShadow = `0 10px 26px rgba(${a.rgb},.42)`;
  });

  const step = tierEls.length > 1 ? Math.min(0.34, TIERS_SPAN / tierEls.length) : 0;

  let scale = 1;
  /**
   * The middle takes what the title and the bands leave it.
   *
   * Measured rather than assumed, for the reason every panel in this library is:
   * "Les cliniques cherchent des donneurs" is half again the length of "100%
   * confidential", and a badge stack laid out to one hand-tuned height loses its
   * last claim in the other six locales.
   */
  function fit(): void {
    mid.style.transform = 'none';
    // Hung under the title rather than centred in what is left. Centring floats
    // the claims in the middle of the frame with a hole above and below them;
    // the title and its claims are one block and read as one.
    const top = head.offsetTop + head.offsetHeight + 52;
    const room = stack.offsetTop - top - 52;
    const height = mid.offsetHeight;
    if (height > 0 && room > 0) scale = Math.min(1, room / height);
    mid.style.top = top + 'px';
    mid.style.transform = `scale(${scale})`;
  }

  function render(t: number): void {
    badgeEls.forEach((badge, i) => {
      const start = BADGES_AT + i * 0.16;
      const move = easeOutBack(seg(t, start, 0.58));
      badge.style.opacity = String(easeOutCubic(seg(t, start, 0.36)));
      badge.style.transform = `translateX(${-120 * (1 - move)}px)`;
    });

    const p = easeOutCubic(seg(t, PLEDGE_AT, 0.55));
    pledge.style.opacity = String(p);
    pledge.style.transform = `scale(${0.92 + 0.08 * p})`;

    tierEls.forEach((tier, i) => {
      const start = TIERS_AT + i * step;
      const move = easeOutBack(seg(t, start, 0.6));
      tier.style.opacity = String(easeOutCubic(seg(t, start, 0.38)));
      tier.style.transform =
        `translateX(${-160 * (1 - move)}px) scale(${0.92 + 0.08 * move})`;
    });
  }

  return { fit, render };
}
