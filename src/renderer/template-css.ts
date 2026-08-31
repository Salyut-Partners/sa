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
  line-height:1.2;text-align:left}
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
.cf-pills-card .shift+.shift{border-left:2px solid #E6EAEE}
.cf-pills-card .shift .tm{font-weight:700;font-size:23px;white-space:nowrap}
.cf-pills-card .perks{margin-top:14px;display:flex;flex-direction:column;gap:7px;padding-left:6px}
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
.cf-panel-card .top .flag{font-size:34px;line-height:1;margin-left:auto}
.cf-panel-card .h1{font-weight:800;font-size:50px;line-height:1.05;margin-top:12px;letter-spacing:-1.1px}
.cf-panel-card .meta{margin-top:11px;display:flex;align-items:center;gap:12px}
.cf-panel-card .chip{font-weight:700;font-size:25px;background:#F1F4F9;border:2px solid #E4E8EF;
  border-radius:999px;padding:8px 18px;white-space:nowrap}
.cf-panel-card .chip.soft{font-weight:500;color:#5A6474;background:#fff}
.cf-panel-card .cf-rate{margin-top:16px;gap:18px;border-radius:20px;padding:14px 24px;
  background:linear-gradient(180deg,#FFFFFF 0%,#F3F6FB 100%)}
.cf-panel-card .cf-rate .big{font-family:'Anton',sans-serif;font-size:76px;line-height:.92;color:#16202F}
.cf-panel-card .cf-rate .unit{font-weight:700;font-size:23px;color:#5A6474;line-height:1.24;text-align:left}
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
.cf-sheet-card .cf-rate .unit{font-weight:700;font-size:30px;color:#5A6474;line-height:1.25;text-align:left}
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
.cf-sc-flag{position:absolute;top:58px;right:64px;font-size:56px;line-height:1}
.cf-sc-col{position:absolute;top:132px;left:64px;width:600px;transform-origin:0 0;
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
.cf-pay-card .amt{margin-top:22px;font-weight:800;font-size:190px;line-height:1.04;
  letter-spacing:-5px;white-space:nowrap;will-change:transform}
.cf-pay-card .rule{margin:54px 0 46px;height:2px;background:#E4E8EF;border-radius:2px}
.cf-pay-card .slbl{font-weight:600;font-size:40px;color:#8A94A2}
/* The knob is centred on the fill's end by half its own width, so the track can
   be laid out in percent and still have the two agree at either extreme. */
.cf-pay-card .track{position:relative;margin-top:42px;height:28px;border-radius:999px;
  background:#E4E8EF}
.cf-pay-card .fill{position:absolute;left:0;top:0;height:100%;border-radius:999px}
.cf-pay-card .knob{position:absolute;top:50%;width:74px;height:74px;margin:-37px 0 0 -37px;
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
  padding:16px 42px 16px 16px;box-shadow:0 14px 34px rgba(0,0,0,.28);will-change:transform,opacity}
.cf-dn-badge .ic{width:78px;height:78px;border-radius:50%;flex:none;
  display:flex;align-items:center;justify-content:center}
.cf-dn-badge .tx{font-family:'Inter',sans-serif;font-weight:700;font-size:40px;line-height:1.15;
  color:#0F1B2A;max-width:660px}
.cf-dn-pledge{margin-top:40px;display:flex;align-items:center;gap:26px;
  background:rgba(8,16,28,.82);border:4px solid;border-radius:26px;padding:22px 34px 22px 22px;
  will-change:transform,opacity}
.cf-dn-pledge .ic{width:88px;height:88px;border-radius:22px;flex:none;
  display:flex;align-items:center;justify-content:center}
.cf-dn-pledge .tx{display:flex;flex-direction:column;font-family:'Inter',sans-serif;
  font-style:italic;font-weight:700;font-size:46px;line-height:1.12}
.cf-dn-pledge .tx .a{color:#fff}
.cf-dn-tiers{position:absolute;left:64px;bottom:118px;width:952px;
  display:flex;flex-direction:column;gap:26px}
.cf-dn-tier{display:flex;align-items:center;background:#fff;border-radius:22px;
  padding:12px 14px 12px 0;box-shadow:0 16px 38px rgba(0,0,0,.3);overflow:hidden;
  will-change:transform,opacity}
/* The band is cut to a point on its right: the row reads left to right, towards
   the button, the way the eye is meant to travel it. */
.cf-dn-tier .band{flex:1;min-width:0;display:flex;align-items:center;padding:22px 64px 22px 40px;
  margin:-12px 0;clip-path:polygon(0 0,calc(100% - 46px) 0,100% 50%,calc(100% - 46px) 100%,0 100%)}
.cf-dn-tier .band .v{font-family:'Inter',sans-serif;font-weight:800;font-size:52px;
  line-height:1;color:#0F1B2A;white-space:nowrap}
.cf-dn-tier .go{flex:none;margin-left:20px;border-radius:16px;padding:22px 40px;color:#fff;
  font-family:'Inter',sans-serif;font-weight:800;font-size:36px;letter-spacing:1.6px;
  white-space:nowrap}
`;
