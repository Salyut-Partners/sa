// The templates' stylesheet. It rides along with the renderer's own so that a
// single import still brings everything a creative needs — in the grid, in the
// library thumbnails and on the headless page alike.
//
// Everything here is laid out against a 1080x1920 frame; the frame itself is
// scaled to the canvas, so no rule in this file needs to know the output size.
export const TEMPLATE_CSS = `
@font-face{font-family:'Inter';src:url('/fonts/Inter-400.ttf') format('truetype');font-weight:400;font-display:block}
@font-face{font-family:'Inter';src:url('/fonts/Inter-500.ttf') format('truetype');font-weight:500;font-display:block}
@font-face{font-family:'Inter';src:url('/fonts/Inter-600.ttf') format('truetype');font-weight:600;font-display:block}
@font-face{font-family:'Inter';src:url('/fonts/Inter-700.ttf') format('truetype');font-weight:700;font-display:block}
@font-face{font-family:'Nunito';src:url('/fonts/Nunito-400.ttf') format('truetype');font-weight:400;font-display:block}
@font-face{font-family:'Nunito';src:url('/fonts/Nunito-600.ttf') format('truetype');font-weight:600;font-display:block}
@font-face{font-family:'Nunito';src:url('/fonts/Nunito-700.ttf') format('truetype');font-weight:700;font-display:block}
@font-face{font-family:'Nunito';src:url('/fonts/Nunito-800.ttf') format('truetype');font-weight:800;font-display:block}

.cf-tpl{position:absolute;inset:0;overflow:hidden}
.cf-tpl-frame{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:0 0}
.cf-tpl-move{position:absolute;left:0;top:0;width:1080px;height:1920px}
.cf-t-tint{position:absolute;inset:0;pointer-events:none}
.cf-t-ic{flex:none}

/* ---------------------------------------------------------- rows banner -- */
.cf-bn-head{position:absolute;top:118px;left:0;width:100%;text-align:center;
  font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1.02;letter-spacing:1px;
  color:#fff;text-transform:uppercase;padding:0 70px;
  text-shadow:0 10px 34px rgba(0,0,0,.72),0 2px 6px rgba(0,0,0,.6)}
.cf-bn-rule{position:absolute;left:50%;width:210px;height:9px;margin-left:-105px;border-radius:6px}
.cf-bn-rows{position:absolute;left:96px;width:888px;display:flex;flex-direction:column;
  transform:translateY(-50%);transform-origin:50% 50%}
.cf-bn-row{display:flex;align-items:center;gap:30px;
  background:rgba(11,12,15,.74);border:2px solid rgba(255,255,255,.10);
  border-radius:26px;backdrop-filter:blur(14px);
  box-shadow:0 22px 60px rgba(0,0,0,.55);transform-origin:8% 50%}
.cf-bn-row .val{font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1;
  color:#fff;letter-spacing:.5px;white-space:nowrap}
.cf-bn-cta{position:absolute;bottom:186px;left:0;width:100%;text-align:center}
.cf-bn-cta .pill{display:inline-block;padding:30px 62px;border-radius:999px;
  background:rgba(11,12,15,.7);border:2px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);
  box-shadow:0 20px 54px rgba(0,0,0,.55);
  font-family:'Inter',sans-serif;font-weight:800;font-size:56px;color:#fff;letter-spacing:.3px}

/* -------------------------------------------------------- cards, shared -- */
.cf-card{position:absolute;left:52px;width:976px;background:#fff;overflow:hidden;
  will-change:transform}
.cf-card .rule{height:2px;background:#E6EAEE;border-radius:2px}
.cf-card .cf-cta{position:relative;display:flex;align-items:center;justify-content:center;
  gap:20px;width:100%;overflow:hidden;color:#fff;will-change:transform,box-shadow}
.cf-card .cf-sheen{position:absolute;top:-25%;left:0;height:150%;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.45) 50%,rgba(255,255,255,0) 100%)}
.cf-card .cf-disc{font-weight:400;color:#A6AEB8;text-align:center}
.cf-card .cf-rate{display:flex;align-items:center;justify-content:center;
  will-change:transform,box-shadow}

/* ------------------------------------------------------ card 1: pills ---- */
.cf-pills-card{bottom:250px;border-radius:34px;padding:24px 34px 20px;
  box-shadow:0 -16px 64px rgba(0,0,0,.5),0 34px 80px rgba(0,0,0,.38);
  font-family:'Nunito',-apple-system,sans-serif;color:#1B2430}
.cf-pills-card .eyebrow{display:block;width:max-content;margin:0 auto 12px;
  font-weight:800;font-size:21px;letter-spacing:3.4px;padding:8px 16px;border-radius:9px}
.cf-pills-card .head{display:flex;align-items:center;justify-content:center;gap:14px;
  font-weight:800;font-size:40px;letter-spacing:-.6px}
.cf-pills-card .head .flag{font-size:34px;line-height:1}
.cf-pills-card .rule{margin-top:13px}
.cf-pills-card .age{margin-top:12px;text-align:center;font-weight:800;font-size:46px;letter-spacing:-.5px}
.cf-pills-card .aud{margin-top:3px;text-align:center;font-weight:600;font-size:26px;color:#6B7784}
.cf-pills-card .cf-rate{margin-top:14px;gap:14px;border-radius:24px;padding:15px 26px}
.cf-pills-card .cf-rate .big{font-weight:900;font-size:80px;line-height:.95;color:#fff;letter-spacing:-3px}
.cf-pills-card .cf-rate .unit{font-weight:700;font-size:24px;color:rgba(255,255,255,.94);
  line-height:1.2;text-align:start}
.cf-pills-card .cf-rate .unit b{font-size:34px}
.cf-pills-card .sec{margin-top:16px}
.cf-pills-card .sec-h{display:flex;align-items:center;gap:14px;font-weight:800;font-size:21px;
  letter-spacing:2.6px}
.cf-pills-card .sec-h .ln{flex:1;height:2px;background:#E6EAEE;border-radius:2px}
.cf-pills-card .sec-h .dot{width:9px;height:9px;border-radius:50%;flex:none}
.cf-pills-card .pills{margin-top:11px;display:flex;flex-wrap:wrap;justify-content:center;gap:9px}
.cf-pills-card .pill{color:#fff;font-weight:700;font-size:24px;padding:9px 20px;border-radius:999px;
  white-space:nowrap}
.cf-pills-card .shifts{margin-top:11px;display:flex}
.cf-pills-card .shift{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:4px 0;will-change:opacity,transform}
.cf-pills-card .shift+.shift{border-inline-start:2px solid #E6EAEE}
.cf-pills-card .shift .tm{font-weight:700;font-size:23px;white-space:nowrap}
.cf-pills-card .perks{margin-top:14px;display:flex;flex-direction:column;gap:7px;padding-inline-start:6px}
.cf-pills-card .perk{display:flex;align-items:center;gap:13px;font-weight:600;font-size:23px;color:#2A3542}
.cf-pills-card .cf-cta{margin-top:16px;border-radius:20px;padding:21px 0;
  font-weight:800;font-size:38px;letter-spacing:2.2px}
.cf-pills-card .cf-disc{margin-top:10px;font-size:15px;line-height:1.3}

/* ------------------------------------------------------ card 2: panel ---- */
.cf-panel-card{bottom:150px;left:46px;width:988px;border-radius:36px;padding:32px 40px 26px;
  background:rgba(255,255,255,.972);
  box-shadow:0 -18px 70px rgba(0,0,0,.55),0 40px 90px rgba(0,0,0,.4);
  font-family:'Inter',-apple-system,sans-serif;color:#111726}
.cf-panel-card .stripe{position:absolute;left:0;top:0;width:100%;height:10px}
.cf-panel-card .top{display:flex;align-items:center;gap:14px}
.cf-panel-card .eyebrow{font-weight:800;font-size:23px;letter-spacing:4px;padding:9px 18px;border-radius:9px}
.cf-panel-card .top .flag{font-size:34px;line-height:1;margin-inline-start:auto}
.cf-panel-card .h1{font-weight:800;font-size:50px;line-height:1.05;margin-top:12px;letter-spacing:-1.1px}
.cf-panel-card .meta{margin-top:11px;display:flex;align-items:center;gap:12px}
.cf-panel-card .chip{font-weight:700;font-size:25px;background:#F1F4F9;border:2px solid #E4E8EF;
  border-radius:999px;padding:8px 18px;white-space:nowrap}
.cf-panel-card .chip.soft{font-weight:500;color:#5A6474;background:#fff}
.cf-panel-card .cf-rate{margin-top:16px;gap:18px;border-radius:20px;padding:14px 24px;
  background:linear-gradient(180deg,#FFFFFF 0%,#F3F6FB 100%)}
.cf-panel-card .cf-rate .big{font-family:'Anton',sans-serif;font-size:76px;line-height:.92;color:#16202F}
.cf-panel-card .cf-rate .unit{font-weight:700;font-size:23px;color:#5A6474;line-height:1.24;text-align:start}
.cf-panel-card .sec{margin-top:16px}
.cf-panel-card .sec-h{font-weight:800;font-size:21px;letter-spacing:3.4px;display:flex;
  align-items:center;gap:13px}
.cf-panel-card .sec-h::after{content:'';flex:1;height:2px;background:#E4E8EF;border-radius:2px}
.cf-panel-card .sec-b{margin-top:9px;font-weight:500;font-size:27px;line-height:1.36;color:#26314A}
.cf-panel-card .shifts{margin-top:10px;display:flex;gap:11px}
.cf-panel-card .shift{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;
  background:#F5F8FC;border:2px solid #E4E8EF;border-radius:15px;padding:12px 8px;
  will-change:box-shadow,background}
.cf-panel-card .shift .tm{font-weight:700;font-size:26px;white-space:nowrap}
.cf-panel-card .perks{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:9px 20px}
.cf-panel-card .perk{display:flex;align-items:center;gap:12px;font-weight:500;font-size:24px;
  line-height:1.2;color:#26314A}
.cf-panel-card .perk.wide{grid-column:1 / -1}
.cf-panel-card .cf-cta{margin-top:20px;border-radius:18px;padding:24px 0;
  font-weight:800;font-size:40px;letter-spacing:2.6px}
.cf-panel-card .cf-disc{margin-top:11px;font-size:15px;line-height:1.3}

/* ------------------------------------------------------ card 3: sheet ---- */
.cf-sheet-card{top:140px;left:46px;width:988px;border-radius:38px;padding:44px 46px 38px;
  background:rgba(255,255,255,.968);
  box-shadow:0 40px 90px rgba(0,0,0,.55);
  font-family:'Inter',-apple-system,sans-serif;color:#111726;will-change:clip-path}
.cf-sheet-card .stripe{position:absolute;left:0;top:0;width:100%;height:12px}
.cf-sheet-card .eyebrow{display:inline-block;font-weight:800;font-size:27px;letter-spacing:4.5px;
  padding:11px 22px;border-radius:10px}
.cf-sheet-card .h1{font-weight:800;font-size:57px;line-height:1.08;margin-top:20px;
  letter-spacing:-1.2px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.cf-sheet-card .h1 .flag{font-size:49px;line-height:1}
.cf-sheet-card .meta{margin-top:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.cf-sheet-card .chip{font-weight:700;font-size:31px;background:#F1F4F9;border:2px solid #E4E8EF;
  border-radius:999px;padding:11px 24px}
.cf-sheet-card .chip.soft{font-weight:500;color:#5A6474;background:#fff}
.cf-sheet-card .cf-rate{margin-top:26px;gap:22px;border-radius:26px;padding:22px 30px;
  background:linear-gradient(180deg,#FFFFFF 0%,#F3F6FB 100%)}
.cf-sheet-card .cf-rate .big{font-family:'Anton',sans-serif;font-size:104px;line-height:.92;
  color:#16202F;letter-spacing:.5px}
.cf-sheet-card .cf-rate .unit{font-weight:700;font-size:30px;color:#5A6474;line-height:1.25;text-align:start}
.cf-sheet-card .sec{margin-top:30px}
.cf-sheet-card .sec-h{font-weight:800;font-size:26px;letter-spacing:4px;display:flex;
  align-items:center;gap:16px}
.cf-sheet-card .sec-h::after{content:'';flex:1;height:3px;background:#E4E8EF;border-radius:2px}
.cf-sheet-card .sec-b{margin-top:14px;font-weight:500;font-size:34px;line-height:1.42;color:#26314A}
.cf-sheet-card .shifts{margin-top:14px;display:flex;flex-direction:column;gap:12px}
.cf-sheet-card .shift{display:flex;align-items:center;gap:20px;background:#F5F8FC;
  border:2px solid #E4E8EF;border-radius:18px;padding:15px 24px;will-change:box-shadow,background}
.cf-sheet-card .shift .tm{font-weight:700;font-size:37px;letter-spacing:.5px}
.cf-sheet-card .perks{margin-top:26px;display:flex;flex-direction:column;gap:11px}
.cf-sheet-card .perk{display:flex;align-items:center;gap:18px;font-weight:500;font-size:33px;color:#26314A}
.cf-sheet-card .cf-cta{margin-top:28px;border-radius:20px;padding:28px 0;
  font-weight:800;font-size:44px;letter-spacing:2.8px}
.cf-sheet-card .cf-disc{margin-top:20px;font-size:17px;line-height:1.35}

/* --------------------------------------------- jobs: scrim, no card ------ */
.cf-sc-flag{position:absolute;top:58px;inset-inline-end:64px;font-size:56px;line-height:1}
.cf-sc-col{position:absolute;top:132px;inset-inline-start:64px;width:600px;transform-origin:0 0;
  display:flex;flex-direction:column;align-items:flex-start;
  font-family:'Inter',-apple-system,sans-serif;color:#fff}
.cf-sc-col .eyebrow{font-weight:800;font-size:30px;letter-spacing:3.2px;color:#fff;
  padding:15px 28px;border-radius:14px;white-space:nowrap;will-change:transform,opacity}
/* No font-size: the title is the one size the layout sets, because a locale whose
   longest word will not fit the column gets a smaller one. See HEAD_SIZE. */
.cf-sc-col .h1{margin-top:26px;font-weight:800;line-height:.98;
  letter-spacing:-2.4px;text-shadow:0 10px 40px rgba(0,0,0,.55);will-change:transform,opacity}
.cf-sc-col .aud{margin-top:22px;font-weight:700;font-size:36px;line-height:1.24;
  color:#C3CCD8;will-change:transform,opacity}
.cf-sc-rate{margin-top:34px;display:flex;flex-direction:column;background:#fff;
  border-radius:30px;padding:26px 40px;color:#16202F;transform-origin:0 50%;
  will-change:transform,box-shadow,opacity}
.cf-sc-rate .top{display:flex;align-items:baseline;gap:14px}
.cf-sc-rate .big{font-weight:800;font-size:86px;line-height:1;letter-spacing:-2.6px;
  white-space:nowrap}
.cf-sc-rate .u{font-weight:700;font-size:34px;color:#6B7784;white-space:nowrap}
.cf-sc-rate .bot{margin-top:8px;font-weight:700;font-size:34px;color:#2A3542}
.cf-sc-col .perks{margin-top:38px;display:flex;flex-direction:column;gap:22px}
.cf-sc-col .perk{display:flex;align-items:center;gap:20px;font-weight:700;font-size:40px;
  line-height:1.18;text-shadow:0 6px 24px rgba(0,0,0,.5);will-change:transform,opacity}
.cf-sc-cta{position:relative;margin-top:44px;width:600px;overflow:hidden;
  display:flex;align-items:center;justify-content:center;gap:22px;
  border-radius:24px;padding:34px 0;color:#fff;font-weight:800;font-size:48px;
  letter-spacing:.4px;will-change:transform,box-shadow,opacity}
.cf-sc-sheen{position:absolute;top:-25%;left:0;height:150%;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.45) 50%,rgba(255,255,255,0) 100%)}

/* ------------------------------------------------ avia: bottom strip ----- */
/* The band is fixed rather than grown from the copy: a CTA button is placed
   under it by hand, and a bar that got taller in German would eat the room that
   button was promised. What gives instead is the copy inside it — see the fit. */
.cf-av-bar{position:absolute;left:0;top:1440px;width:1080px;height:240px;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,rgba(10,14,22,.90) 0%,rgba(7,10,17,.95) 100%);
  backdrop-filter:blur(14px);
  /* No outer shadow. A CTA button is placed by hand in the band below, and even
     the tail of a blur reaching into it is a pixel this layout did not promise
     to draw. The softening onto the photo is a gradient above the bar instead —
     see .cf-av-glow — which paints only upward and can be measured saying so. */
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07);
  will-change:transform,opacity}
.cf-av-glow{position:absolute;left:0;bottom:100%;width:100%;height:76px;
  background:linear-gradient(180deg,rgba(4,7,13,0) 0%,rgba(4,7,13,.34) 62%,rgba(4,7,13,.6) 100%)}
.cf-av-rule{position:absolute;left:0;top:0;width:100%;height:6px;transform-origin:50% 50%;
  will-change:transform,box-shadow}
.cf-av-in{width:968px;display:flex;flex-direction:column;align-items:center;
  transform-origin:50% 50%;font-family:'Inter',-apple-system,sans-serif}
/* No font-size: the perks are the one size the layout sets, because a locale
   with a word too wide for the strip gets a smaller one. See PERK_SIZE. */
.cf-av-perks{display:flex;flex-direction:column;flex-wrap:wrap;align-items:center;
  justify-content:center;row-gap:10px;width:100%}
.cf-av-perks .line{display:flex;align-items:center;justify-content:center;flex-wrap:nowrap}
.cf-av-perks .perk{font-weight:700;line-height:1.16;color:#fff;white-space:nowrap;
  text-shadow:0 4px 18px rgba(0,0,0,.6);will-change:transform,opacity}
.cf-av-perks .sep{flex:none;width:9px;height:9px;margin:0 22px;border-radius:50%;
  will-change:transform,opacity}
.cf-av-disc{margin-top:20px;font-weight:400;font-size:22px;line-height:1.3;text-align:center;
  color:rgba(255,255,255,.46);will-change:transform,opacity}

/* -------------------------------------------- payment: rate slider ------- */
.cf-pay-top{position:absolute;top:56px;left:60px;width:960px;transform-origin:50% 0;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  font-family:'Inter',-apple-system,sans-serif;color:#16233A}
/* No font-size: the headline is the one size the layout sets, because a locale
   whose longest word will not fit the block gets a smaller one. See HEAD_SIZE. */
.cf-pay-top .head{font-weight:800;line-height:1.02;letter-spacing:-2.6px;
  text-shadow:0 6px 26px rgba(255,255,255,.6);will-change:transform,opacity}
.cf-pay-top .sub{margin-top:34px;padding:0 60px;font-weight:700;font-size:50px;
  line-height:1.28;color:#2A3542;text-shadow:0 4px 18px rgba(255,255,255,.6);
  will-change:transform,opacity}
.cf-pay-card{margin-top:280px;width:816px;background:#fff;border-radius:60px;
  padding:92px 56px 80px;box-shadow:0 34px 80px rgba(10,20,35,.34);
  will-change:transform,opacity}
.cf-pay-card .lbl{font-weight:600;font-size:50px;color:#4A5666}
/* Tabular figures: the amount counts up, and proportional digits would make it
   twitch sideways on every tick. */
.cf-pay-card .amt{margin-top:22px;font-weight:800;font-size:190px;line-height:1.04;
  letter-spacing:-5px;white-space:nowrap;font-variant-numeric:tabular-nums;
  will-change:transform}
.cf-pay-card .rule{margin:54px 0 46px;height:2px;background:#E4E8EF;border-radius:2px}
.cf-pay-card .slbl{font-weight:600;font-size:40px;color:#8A94A2}
/* The knob is centred on the fill's end by half its own width, so the track can
   be laid out in percent and still have the two agree at either extreme. */
.cf-pay-card .track{position:relative;margin-top:42px;height:28px;border-radius:999px;
  background:#E4E8EF}
.cf-pay-card .fill{position:absolute;inset-inline-start:0;top:0;height:100%;border-radius:999px}
.cf-pay-card .knob{position:absolute;top:50%;width:74px;height:74px;
  margin-top:-37px;margin-inline-start:-37px;
  border-radius:50%;border:7px solid #fff}
.cf-pay-card .ends{margin-top:46px;display:flex;justify-content:space-between;
  font-weight:600;font-size:42px;color:#3A4554}
.cf-pay-foot{position:absolute;left:0;bottom:56px;width:100%;display:flex;
  flex-direction:column;align-items:center;font-family:'Inter',-apple-system,sans-serif}
.cf-pay-cta{position:relative;width:790px;overflow:hidden;display:flex;align-items:center;
  justify-content:center;border-radius:26px;padding:34px 0;color:#fff;font-weight:800;
  font-size:50px;letter-spacing:.4px;will-change:transform,box-shadow,opacity}
.cf-pay-sheen{position:absolute;top:-25%;left:0;height:150%;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.45) 50%,rgba(255,255,255,0) 100%)}
.cf-pay-foot .hint{margin-top:36px;display:flex;align-items:center;gap:18px;
  font-weight:600;font-size:38px;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.6);
  will-change:opacity}

/* ------------------------------------------------- donor: age bands ------ */
.cf-dn-head{position:absolute;top:104px;left:64px;width:952px;display:flex;flex-direction:column;
  font-family:'Anton','Avenir Next Condensed',sans-serif;font-size:158px;line-height:.9;
  letter-spacing:-1px;text-transform:uppercase}
.cf-dn-head .bot{color:#fff;text-shadow:0 8px 34px rgba(0,0,0,.5)}
.cf-dn-mid{position:absolute;left:64px;width:952px;transform-origin:0 0}
.cf-dn-badges{display:flex;flex-direction:column;gap:22px;align-items:flex-start}
.cf-dn-badge{display:flex;align-items:center;gap:24px;background:#fff;border-radius:999px;
  padding-block:16px;padding-inline:16px 42px;
  box-shadow:0 14px 34px rgba(0,0,0,.28);will-change:transform,opacity}
.cf-dn-badge .ic{width:78px;height:78px;border-radius:50%;flex:none;
  display:flex;align-items:center;justify-content:center}
.cf-dn-badge .tx{font-family:'Inter',sans-serif;font-weight:700;font-size:40px;line-height:1.15;
  color:#0F1B2A;max-width:660px}
.cf-dn-pledge{margin-top:40px;display:flex;align-items:center;gap:26px;
  background:rgba(8,16,28,.82);border:4px solid;border-radius:26px;
  padding-block:22px;padding-inline:22px 34px;
  will-change:transform,opacity}
.cf-dn-pledge .ic{width:88px;height:88px;border-radius:22px;flex:none;
  display:flex;align-items:center;justify-content:center}
.cf-dn-pledge .tx{display:flex;flex-direction:column;font-family:'Inter',sans-serif;
  font-style:italic;font-weight:700;font-size:46px;line-height:1.12}
.cf-dn-pledge .tx .a{color:#fff}
/* Where the donor call puts the stack: under everything else it has said. */
.cf-dn-tiers{position:absolute;left:64px;bottom:118px;width:952px;
  display:flex;flex-direction:column;gap:26px}
/* Where the strip puts it: the same place, but with nothing above it, and
   free to be slid up the frame from there. */
.cf-tr-stack{position:absolute;left:64px;bottom:118px;width:952px;
  display:flex;flex-direction:column;gap:26px}
/* The row itself belongs to neither layout — see tier-stack.ts. */
.cf-tier{display:flex;align-items:center;background:#fff;border-radius:22px;
  padding-block:12px;padding-inline:0 14px;box-shadow:0 16px 38px rgba(0,0,0,.3);overflow:hidden;
  will-change:transform,opacity}
/* The band is cut to a point at the end it is read towards — towards the
   button, the way the eye is meant to travel the row. Which end that is depends
   on the language, and the mirrored cut is with the rest of the flip below. */
.cf-tier .band{flex:1;min-width:0;display:flex;align-items:center;
  padding-block:22px;padding-inline:40px 64px;
  margin:-12px 0;clip-path:polygon(0 0,calc(100% - 46px) 0,100% 50%,calc(100% - 46px) 100%,0 100%)}
.cf-tier .band .v{font-family:'Inter',sans-serif;font-weight:800;font-size:52px;
  line-height:1;color:#0F1B2A;white-space:nowrap}
.cf-tier .go{flex:none;margin-inline-start:20px;border-radius:16px;padding:22px 40px;color:#fff;
  font-family:'Inter',sans-serif;font-weight:800;font-size:36px;letter-spacing:1.6px;
  white-space:nowrap}

/* ----------------------------------------------------------- news strips -- */
/* All three sit 300px off the bottom, which leaves the band under them for a
   button placed by hand, and all three can be slid up the frame from there. */
.cf-nw-tab{position:absolute;inset-inline-start:0;bottom:300px;width:1010px;
  display:flex;flex-direction:column;align-items:flex-start}
.cf-nw-tab .tag{display:flex;align-items:center;gap:22px;
  padding-block:14px 12px;padding-inline:56px 40px;
  font-family:'Inter',sans-serif;font-weight:700;font-size:34px;line-height:1;
  letter-spacing:3px;text-transform:uppercase;color:#14213A;will-change:transform,opacity}
.cf-nw-tab .tag i{width:6px;height:44px;border-radius:2px;flex:none}
.cf-nw-tab .bar{width:1010px;background:#2E3448;padding-block:30px 32px;padding-inline:56px 50px;
  box-shadow:0 18px 44px rgba(0,0,0,.4)}
.cf-nw-tab .hd{width:904px;font-family:'Inter',sans-serif;font-weight:600;line-height:1.12;
  letter-spacing:2px;text-transform:uppercase;color:#fff}
.cf-nw-tab .sub{background:rgba(255,255,255,.94);padding-block:12px;padding-inline:56px 40px;
  font-family:'Inter',sans-serif;font-weight:500;font-size:30px;line-height:1.2;color:#2E3448}

.cf-nw-tv{position:absolute;left:44px;right:44px;bottom:300px}
/* The bar is cut on a slant at the end it is read towards; mirrored below. */
.cf-nw-tv .row{position:relative;overflow:hidden;display:flex;align-items:stretch;
  padding:8px;padding-inline-end:74px;border-start-start-radius:14px;border-end-start-radius:14px;
  clip-path:polygon(0 0,calc(100% - 64px) 0,100% 100%,0 100%)}
.cf-nw-tv .kick{flex:none;display:flex;align-items:center;padding:0 34px;
  font-family:'Inter',sans-serif;font-weight:800;font-size:50px;line-height:1;letter-spacing:1px;
  text-transform:uppercase;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.35)}
.cf-nw-tv .plate{flex:1;min-width:0;background:linear-gradient(180deg,#fff 0%,#E8EBF0 100%);
  border-radius:10px;padding:22px 30px;display:flex;align-items:center}
.cf-nw-tv .hd{width:100%;font-family:'Inter',sans-serif;font-weight:800;line-height:1.1;
  text-transform:uppercase;text-align:center;color:#14161C}
.cf-nw-tv .sheen{position:absolute;top:0;bottom:0;left:0;width:140px;pointer-events:none;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.4),rgba(255,255,255,0))}
.cf-nw-tv .sub{display:inline-flex;align-items:center;gap:16px;margin-top:12px;margin-inline-start:8px;
  max-width:900px;background:#fff;border-radius:6px;padding:10px 26px;
  box-shadow:0 10px 26px rgba(0,0,0,.3);
  font-family:'Inter',sans-serif;font-weight:600;font-size:28px;line-height:1.2;color:#222}
.cf-nw-tv .sub i{width:16px;height:16px;border-radius:50%;flex:none}

.cf-nw-box{position:absolute;left:56px;right:56px;bottom:300px;background:#fff;
  padding:58px 44px 40px;box-shadow:0 24px 60px rgba(0,0,0,.45);transform-origin:50% 100%;
  will-change:transform,opacity}
.cf-nw-box .tag{position:absolute;top:-46px;inset-inline-start:30px;padding:8px 22px 4px;
  font-family:'Anton','Avenir Next Condensed',sans-serif;font-size:72px;line-height:1;
  letter-spacing:1px;text-transform:uppercase;color:#fff;will-change:transform,opacity}
.cf-nw-box .hd{width:880px;font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1.02;
  letter-spacing:.5px;text-transform:uppercase;color:#111}
.cf-nw-box .sub{margin-top:24px;display:flex;align-items:center;gap:16px;
  font-family:'Inter',sans-serif;font-weight:700;font-size:30px;line-height:1.2;
  letter-spacing:1.5px;text-transform:uppercase;color:#555}
.cf-nw-box .sub i{width:36px;height:6px;flex:none}

/* -------------------------------------------------------- headline blocks -- */
.cf-hb{position:absolute;top:150px;left:60px;width:960px;
  display:flex;flex-direction:column;align-items:center;gap:16px}
.cf-hb .tag{margin-bottom:6px;padding:12px 28px 10px;border-radius:10px;background:#FFD83A;
  font-family:'Inter',sans-serif;font-weight:800;font-size:40px;line-height:1;letter-spacing:1px;
  text-transform:uppercase;color:#111;box-shadow:0 10px 24px rgba(0,0,0,.3);will-change:transform,opacity}
.cf-hb .ln{background:#fff;padding:8px 26px 4px;box-shadow:0 14px 32px rgba(0,0,0,.38);
  will-change:transform,opacity}
.cf-hb .ln span{display:block;font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1.06;
  letter-spacing:.5px;text-transform:uppercase;color:#111;white-space:nowrap}
.cf-hb .ln.a span{color:#fff}

/* ------------------------------------------------------------ photo panel -- */
.cf-pp{position:absolute;left:0;right:0;bottom:0;min-height:700px;background:#fff;
  display:flex;flex-direction:column;justify-content:center;padding:80px 70px 120px;
  box-shadow:0 -20px 50px rgba(0,0,0,.35)}
.cf-pp .rule{position:absolute;top:0;left:0;right:0;height:12px}
.cf-pp .in{transform-origin:50% 100%}
.cf-pp .hd{font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1.06;letter-spacing:.5px;
  text-transform:uppercase;text-align:center;color:#121826}
.cf-pp .lk{margin-top:36px;text-align:center}
.cf-pp .lk span{display:inline-block;padding-bottom:10px;background-repeat:no-repeat;
  font-family:'Inter',sans-serif;font-weight:700;font-size:36px;line-height:1.2;
  letter-spacing:1px;text-transform:uppercase}

/* ---------------------------------------------------------- verdict pills -- */
.cf-vp{position:absolute;left:60px;width:960px;bottom:300px;
  display:flex;flex-direction:column;align-items:center;gap:22px}
.cf-vp .pill{display:flex;align-items:center;gap:16px;max-width:960px;
  padding-block:16px;padding-inline:22px 36px;border-radius:999px;border:4px solid rgba(255,255,255,.6);
  font-family:'Inter',sans-serif;font-weight:800;line-height:1.1;text-transform:uppercase;color:#fff;
  text-shadow:0 2px 6px rgba(0,0,0,.3);will-change:transform,opacity}
.cf-vp .pill span{position:relative;white-space:nowrap}
.cf-vp .no{background:linear-gradient(180deg,#FF8461 0%,#E8452C 100%);box-shadow:0 0 34px rgba(255,90,60,.75)}
.cf-vp .yes{background:linear-gradient(180deg,#5BEA78 0%,#1FAE3E 100%);box-shadow:0 0 34px rgba(60,220,90,.75)}
.cf-vp .strike{position:absolute;left:-4px;right:-4px;top:50%;height:6px;margin-top:-3px;border-radius:3px;
  background:#fff;transform-origin:0 50%;transform:scaleX(0)}
[dir=rtl] .cf-vp .strike{transform-origin:100% 50%}

/* ----------------------------------------------------------- option tiles -- */
.cf-ot{position:absolute;left:40px;right:40px;bottom:300px;display:flex;gap:18px}
.cf-ot .tile{flex:1;min-width:0;background:#fff;border-radius:18px;overflow:hidden;
  box-shadow:0 14px 34px rgba(0,0,0,.4);display:flex;flex-direction:column;will-change:transform,opacity}
.cf-ot .v,.cf-ot .go{text-align:center;overflow:hidden}
.cf-ot .v{padding:26px 10px 18px;font-family:'Inter',sans-serif;font-weight:800;line-height:1.1;color:#111}
.cf-ot .go{padding:16px 10px;font-family:'Inter',sans-serif;font-weight:800;line-height:1.1;color:#fff;
  text-decoration:underline;text-underline-offset:6px}
.cf-ot .v span,.cf-ot .go span{white-space:nowrap}

/* ------------------------------------------------------------- steps card -- */
.cf-st .head{position:absolute;top:0;left:110px;width:860px;background:#fff;
  padding:110px 50px 44px;border-radius:0 0 30px 30px;box-shadow:0 18px 44px rgba(0,0,0,.35)}
.cf-st .hd{font-family:'Inter',sans-serif;font-weight:800;font-size:72px;line-height:1.1;
  text-align:center;color:#111}
.cf-st .steps{position:absolute;top:720px;left:110px;width:860px;
  display:flex;flex-direction:column;align-items:flex-start;gap:30px}
.cf-st .step{display:flex;align-items:center;filter:drop-shadow(0 12px 22px rgba(0,0,0,.35));
  will-change:transform,opacity}
.cf-st .step b{flex:none;width:96px;height:96px;border-radius:18px;display:flex;align-items:center;
  justify-content:center;font-family:'Inter',sans-serif;font-weight:800;font-size:58px;color:#fff;
  box-shadow:inset 0 -6px 0 rgba(0,0,0,.18)}
.cf-st .step span{margin-inline-start:-10px;background:#fff;padding-block:18px;padding-inline:34px 30px;
  font-family:'Inter',sans-serif;font-weight:700;line-height:1.1;color:#111;white-space:nowrap}
.cf-st .badge{position:absolute;top:470px;inset-inline-end:60px;width:250px;height:250px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;
  border:6px solid #fff;will-change:transform,opacity}
.cf-st .badge span{font-family:'Inter',sans-serif;font-weight:800;font-size:46px;line-height:1.05;color:#fff}

/* ------------------------------------------------------------- gauge swap -- */
.cf-gs{position:absolute;left:60px;width:960px;bottom:260px;
  display:flex;flex-direction:column;align-items:center;gap:44px}
.cf-gs .hd{width:960px;padding:30px 40px;border-radius:30px;background:rgba(10,8,22,.78);
  backdrop-filter:blur(12px);font-family:'Inter',sans-serif;font-weight:800;line-height:1.15;
  text-align:center;color:#fff}
.cf-gs .dials{display:flex;align-items:center;gap:30px}
.cf-gs .dial{position:relative;width:300px;height:300px;border-radius:50%;overflow:hidden;
  border:10px solid #fff;background:#120C22;box-shadow:0 0 44px rgba(0,0,0,.5);
  display:flex;align-items:center;justify-content:center;will-change:transform,opacity}
.cf-gs .from{border-color:#FF4A3D;box-shadow:0 0 44px rgba(255,60,50,.7)}
.cf-gs .to{border-color:#4BE36A;box-shadow:0 0 44px rgba(70,230,100,.7)}
.cf-gs .liq{position:absolute;left:-150px;top:0;width:580px;height:580px;border-radius:42%}
.cf-gs .from .liq{background:linear-gradient(180deg,#FF5A4A 0%,#C3170E 100%)}
.cf-gs .to .liq{background:linear-gradient(180deg,#6BF087 0%,#1C9E37 100%)}
.cf-gs .dial span{position:relative;font-family:'Inter',sans-serif;font-weight:800;font-size:96px;
  color:#fff;text-shadow:0 4px 14px rgba(0,0,0,.55)}
.cf-gs .arw{display:flex;gap:4px}
.cf-gs .arw i{width:34px;height:34px;border-top:12px solid;border-right:12px solid;transform:rotate(45deg)}
[dir=rtl] .cf-gs .arw i{transform:rotate(-135deg)}
.cf-gs .go{padding:28px 90px;border-radius:999px;border:4px solid rgba(255,255,255,.55);
  font-family:'Inter',sans-serif;font-weight:800;font-size:54px;line-height:1;color:#fff;
  text-shadow:0 3px 10px rgba(0,0,0,.35);white-space:nowrap;will-change:transform,opacity}

/* ------------------------------------------------------------ notice push -- */
.cf-np{position:absolute;top:110px;left:40px;right:40px;display:flex;gap:28px;align-items:flex-start;
  padding:30px 34px;border-radius:40px;background:rgba(246,246,248,.94);backdrop-filter:blur(18px);
  box-shadow:0 20px 50px rgba(0,0,0,.35);will-change:transform,opacity}
.cf-np .ic{flex:none;width:110px;height:110px;border-radius:26px;display:flex;align-items:center;
  justify-content:center;font-family:'Inter',sans-serif;font-weight:800;font-size:62px;color:#fff}
.cf-np .tx{flex:1;min-width:0;font-family:'Inter',sans-serif;color:#111}
.cf-np .top{display:flex;justify-content:space-between;gap:20px;font-size:30px;line-height:1.2}
.cf-np .app{font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#444}
.cf-np .when{color:#888}
.cf-np .ti{margin-top:6px;font-weight:700;font-size:40px;line-height:1.2}
.cf-np .bd{margin-top:4px;font-weight:400;font-size:38px;line-height:1.25;color:#333}

/* ----------------------------------------------------------- notice alert -- */
.cf-na-dim{position:absolute;inset:0;background:rgba(0,0,0,.28)}
.cf-na{position:absolute;top:640px;left:140px;width:800px;border-radius:36px;overflow:hidden;
  background:rgba(255,255,255,.97);box-shadow:0 30px 70px rgba(0,0,0,.45);font-family:'Inter',sans-serif;
  will-change:transform,opacity}
.cf-na .ti{display:flex;align-items:center;justify-content:center;gap:20px;padding:44px 44px 0;
  font-weight:800;font-size:54px;line-height:1.15;color:#111}
.cf-na .bd{padding:20px 50px 40px;text-align:center;font-weight:400;font-size:40px;line-height:1.35;color:#333}
.cf-na .btns{display:flex;border-top:2px solid #D9D9DE}
.cf-na .btns div{flex:1;padding:30px 20px;text-align:center;font-size:44px;line-height:1.1}
.cf-na .no{font-weight:500;color:#222;border-inline-end:2px solid #D9D9DE}
.cf-na .yes{font-weight:700}

/* ---------------------------------------------------------- notice bubble -- */
.cf-nb{position:absolute;top:130px;left:60px;max-width:820px;padding:24px 34px 30px;
  border-radius:30px;background:#fff;box-shadow:0 18px 44px rgba(0,0,0,.35);
  transform-origin:10% 100%;will-change:transform,opacity}
.cf-nb::after{content:'';position:absolute;bottom:-26px;left:46px;
  border-left:18px solid transparent;border-right:18px solid transparent;border-top:28px solid #fff}
[dir=rtl] .cf-nb{left:auto;right:60px;transform-origin:90% 100%}
[dir=rtl] .cf-nb::after{left:auto;right:46px}
.cf-nb .lb{font-family:'Inter',sans-serif;font-weight:500;font-size:28px;color:#8A8A90;margin-bottom:12px}
.cf-nb .row{display:flex;align-items:flex-start;gap:22px}
.cf-nb .av{flex:none;width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.cf-nb .q{font-family:'Inter',sans-serif;font-weight:800;font-size:48px;line-height:1.2;color:#111}
.cf-nb .q .rest{visibility:hidden}

/* -------------------------------------------------------------- guide arc -- */
/* Wider than the frame so the arch's ends run off its sides rather than
   curling down inside the picture. */
.cf-ga{position:absolute;left:-120px;width:1320px;bottom:0;min-height:900px;background:#fff;
  border-top:16px solid;border-radius:50% 50% 0 0/150px 150px 0 0;
  display:flex;flex-direction:column;justify-content:center;padding:130px 200px 120px}
.cf-ga .dots{position:absolute;top:120px;width:120px;height:90px;background-size:30px 30px;opacity:.9}
.cf-ga .dots.l{left:150px}
.cf-ga .dots.r{right:150px}
.cf-ga .in{display:flex;flex-direction:column;align-items:center;transform-origin:50% 100%}
.cf-ga .tag{display:flex;align-items:center;gap:22px;width:100%;margin-bottom:24px}
.cf-ga .tag i{flex:1;height:4px;border-radius:2px;transform-origin:50% 50%}
.cf-ga .tag span{flex:none;padding:10px 34px;border-radius:999px;
  font-family:'Inter',sans-serif;font-weight:700;font-size:38px;line-height:1.1;color:#fff}
.cf-ga .hd{width:100%;font-family:'Anton','Avenir Next Condensed',sans-serif;line-height:1.04;
  text-align:center;color:#141625}
.cf-ga .hd .a{display:block}
.cf-ga .sub{margin-top:22px;font-family:'Inter',sans-serif;font-weight:500;font-size:34px;
  line-height:1.3;text-align:center;color:#3A3D4A}
.cf-ga .act{margin-top:48px;display:flex;align-items:center;justify-content:center;gap:44px}
.cf-ga .mk{flex:none;width:130px;height:130px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;will-change:transform,opacity}
.cf-ga .go{position:relative;overflow:hidden;padding:30px 70px;border-radius:999px;
  font-family:'Inter',sans-serif;font-weight:700;font-size:46px;line-height:1;color:#fff;
  white-space:nowrap;will-change:transform,opacity}
.cf-ga .go .sheen{position:absolute;top:-20%;bottom:-20%;left:0;width:120px;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.45),rgba(255,255,255,0))}

/* ------------------------------------------------- read the other way --- */
/* Almost all of the mirroring is already done by the time this block is
   reached: the frame carries its own dir, the rows are laid out by the flow, and
   the edges above are written as starts and ends. What is left is the handful of
   things with no logical form — a clipped corner, the origin a block scales
   about — each of which would otherwise point at the wrong side of a Hebrew
   frame. See localeDir in core/locales.ts. */

/* The cut corner moves to the other end of the band, so it still points at the
   button rather than off the outer edge of the row. */
[dir=rtl] .cf-tier .band{
  clip-path:polygon(100% 0,46px 0,0 50%,46px 100%,100% 100%)}

/* The broadcast bar's slant moves to the end a Hebrew headline is read towards. */
[dir=rtl] .cf-nw-tv .row{clip-path:polygon(64px 0,100% 0,100% 100%,0 100%)}

/* A block grows out of the corner the eye enters by, which is the other corner. */
[dir=rtl] .cf-sc-col{transform-origin:100% 0}
[dir=rtl] .cf-sc-rate{transform-origin:100% 50%}
[dir=rtl] .cf-dn-mid{transform-origin:100% 0}
[dir=rtl] .cf-bn-row{transform-origin:92% 50%}
`;
