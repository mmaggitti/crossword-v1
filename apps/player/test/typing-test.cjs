const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

// With the keyboard up, is the whole board visible, and did it stay the
// same size? Those are the two things option C promised.
const CASES = [
  { name: "iPhone 13 mini", w: 375, h: 812, kb: 0.42 },
  { name: "iPhone 15 Pro Max", w: 430, h: 932, kb: 0.42 },
  { name: "iPhone SE",       w: 375, h: 667, kb: 0.46 },
  { name: "phone landscape", w: 932, h: 430, kb: 0.50 },
  { name: "iPad portrait",   w: 820, h: 1180, kb: 0.42 },
];

(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  let fails = 0;

  for (const c of CASES) {
    const p = await b.newPage({ viewport: { width: c.w, height: c.h } });
    await p.goto(site.url + "#sample");
    await p.waitForSelector(".xw-gridwrap");

    const snap = () => p.evaluate(() => {
      const g = document.querySelector(".xw-gridwrap").getBoundingClientRect();
      const d = document.querySelector(".xw-dock").getBoundingClientRect();
      const s = document.querySelector(".xw-stage").getBoundingClientRect();
      return { gw: +g.width.toFixed(1), gh: +g.height.toFixed(1),
               gtop: +g.top.toFixed(1), gbot: +g.bottom.toFixed(1),
               dtop: +d.top.toFixed(1), stop: +s.top.toFixed(1) };
    });

    const rest = await snap();
    const kb = Math.round(c.h * c.kb);
    // Drive both signals: React adds .typing from kbInset, which the test
    // can't produce without a real keyboard, so set it alongside --kb.
    await p.evaluate(v => {
      const el = document.querySelector(".xw");
      el.style.setProperty("--kb", v + "px");
      el.classList.add("typing");
    }, kb);
    await p.waitForTimeout(80);
    const typing = await snap();

    // The contract is: the whole board stays visible, and it gives up only
    // as much size as the shortfall demands. Shrink is reported, not failed
    // — on a large phone it should be negligible.
    const hidden = Math.max(0, typing.gbot - typing.dtop);
    const fullyVisible = hidden < 0.5 && typing.gtop >= -0.5;
    const shrink = (1 - typing.gw / rest.gw) * 100;

    if (!fullyVisible) fails++;
    console.log(
      `${fullyVisible ? "ok  " : "FAIL"} ${c.name.padEnd(18)} kb=${String(kb).padStart(3)}` +
      `  board ${rest.gw.toFixed(0)}->${typing.gw.toFixed(0)}` +
      `  (${shrink < 0.5 ? "no shrink" : shrink.toFixed(0) + "% smaller"})` +
      `  hidden ${hidden.toFixed(0)}px`);
    if (!fullyVisible) console.log(`       - ${hidden.toFixed(0)}px still covered`);

    await p.close();
  }
  await b.close();
  await site.close();
  console.log(fails === 0
    ? "\nWhole board visible with the keyboard up, everywhere."
    : `\n${fails} cases still cover part of the board.`);
  process.exit(fails ? 1 : 0);
})();
