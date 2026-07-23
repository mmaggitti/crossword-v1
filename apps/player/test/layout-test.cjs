const { chromium, webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

const VIEWPORTS = [
  { name: "iPhone 13 mini", w: 375, h: 812 },
  { name: "iPhone 15 Pro Max", w: 430, h: 932 },
  { name: "iPad portrait", w: 820, h: 1180 },
  { name: "desktop", w: 1280, h: 800 },
];

// Fraction of viewport height a software keyboard typically covers.
const KEYBOARD_FRACTIONS = [0, 0.42];

async function probe(page) {
  return page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
               bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1) };
    };
    const stage = document.querySelector(".xw-stage");
    const cs = stage ? getComputedStyle(stage) : null;
    const pad = cs ? { t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom),
                       l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight) } : null;
    return {
      app:   r(document.querySelector(".xw")),
      head:  r(document.querySelector(".xw-head")),
      stage: r(stage),
      stagePad: pad,
      grid:  r(document.querySelector(".xw-gridwrap")),
      cell0: r(document.querySelector(".xw-cell")),
      dock:  r(document.querySelector(".xw-dock")),
      docBody: { w: document.body.scrollWidth, h: document.body.scrollHeight },
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
}

(async () => {
  const engine = process.env.ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const site = await serve(DIST);
  console.log("engine:", process.env.ENGINE || "chromium");
  let failures = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(site.url + "#sample");
    await page.waitForSelector(".xw-gridwrap");
    await page.waitForTimeout(120);

    for (const kf of KEYBOARD_FRACTIONS) {
      const kb = Math.round(vp.h * kf);
      await page.evaluate((v) => {
        document.querySelector(".xw").style.setProperty("--kb", v + "px");
      }, kb);
      await page.waitForTimeout(60);

      const m = await probe(page);
      const label = `${vp.name} ${vp.w}x${vp.h}  kb=${kb}`;

      // Stage inner box (content box, padding excluded)
      const innerW = m.stage.w - m.stagePad.l - m.stagePad.r;
      const innerH = m.stage.h - m.stagePad.t - m.stagePad.b;

      const checks = [
        ["grid width fits stage",  m.grid.w <= innerW + 0.5],
        ["grid height fits stage", m.grid.h <= innerH + 0.5],
        ["grid inside stage top",  m.grid.y >= m.stage.y - 0.5],
        ["grid inside stage bot",  m.grid.bottom <= m.stage.bottom + 0.5],
        ["cells square",           Math.abs(m.cell0.w - m.cell0.h) < 1.5],
        ["app fills viewport",     Math.abs(m.app.h - vp.h) < 1.5],
        ["page does not scroll",   m.docBody.h <= vp.h + 1],
      ];

      const bad = checks.filter(([, ok]) => !ok);
      failures += bad.length;
      console.log(
        (bad.length ? "FAIL " : "ok   ") + label +
        `  | stage ${innerW.toFixed(0)}x${innerH.toFixed(0)}` +
        `  grid ${m.grid.w.toFixed(0)}x${m.grid.h.toFixed(0)}` +
        `  cell ${m.cell0.w.toFixed(1)}x${m.cell0.h.toFixed(1)}`
      );
      bad.forEach(([n]) => console.log("       - " + n));
    }
    await page.close();
  }

  await browser.close();
  await site.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILING CHECKS`);
  process.exit(failures === 0 ? 0 : 1);
})();
