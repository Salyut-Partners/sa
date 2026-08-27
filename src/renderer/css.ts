// The renderer ships its own stylesheet and injects it on first use. That is
// what lets a single import be enough in the editor, in a library thumbnail and
// in the headless render target — there is no CSS file for a consumer to forget.
export const RENDERER_STYLE_ID = 'cf-renderer-style';

export const RENDERER_CSS = `
@font-face{font-family:'Anton';src:url('/fonts/Anton.ttf') format('truetype');font-weight:400;font-display:block}
@font-face{font-family:'Inter';src:url('/fonts/Inter-800.ttf') format('truetype');font-weight:800;font-display:block}
@font-face{font-family:'Nunito';src:url('/fonts/Nunito-900.ttf') format('truetype');font-weight:900;font-display:block}

.cf-stage{position:relative;overflow:hidden;background:#000}
.cf-stage *{margin:0;padding:0;box-sizing:border-box}
.cf-wrap{position:absolute;inset:0;transform-origin:50% 50%;will-change:transform}
.cf-base{position:absolute;left:0;top:0;width:100%;height:100%;display:block;object-fit:cover}

.cf-layer{position:absolute;will-change:transform,opacity}
.cf-btn{position:absolute;inset:0;display:block;will-change:transform,box-shadow}
.cf-fill{position:relative;width:100%;height:100%;display:flex;align-items:center;
  justify-content:center;overflow:hidden}
/* flex:none is load-bearing: as a shrinkable flex item the label would be
   squeezed to the button width, and the fitting loop measures that squeezed
   width — so it would never see the overflow it exists to remove. */
.cf-txt{position:relative;z-index:2;flex:none;color:#fff;white-space:nowrap;line-height:1}
.cf-arrow{position:relative;z-index:2;flex:none}
.cf-gloss,.cf-flash{position:absolute;inset:0;pointer-events:none}
.cf-flash{opacity:0}
.cf-sheen{position:absolute;top:-25%;height:150%;left:0;pointer-events:none;
  background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.55) 50%,rgba(255,255,255,0) 100%)}
`;

/** Idempotent: many stages on one page share one stylesheet. */
export function ensureRendererStyle(doc: Document): void {
  if (doc.getElementById(RENDERER_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = RENDERER_STYLE_ID;
  style.textContent = RENDERER_CSS;
  doc.head.appendChild(style);
}
