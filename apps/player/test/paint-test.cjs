const { chromium, webkit } = require("playwright");
const { PNG } = require("pngjs");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

// Paint test (not hit test): with the dock lifted, every pixel in the strip
// it vacated must be canvas. This is the safety net that makes the ghosting
// impossible regardless of how the keyboard geometry lands.
(async () => {
  const engine = process.env.ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const site = await serve(DIST);
  let fails = 0;

  for (const vp of [{w:375,h:812},{w:430,h:932},{w:820,h:1180}]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(site.url + "#sample");
    await page.waitForSelector(".xw-gridwrap");

    const kb = Math.round(vp.h * 0.42);
    await page.evaluate((v) => document.querySelector(".xw").style.setProperty("--kb", v + "px"), kb);
    await page.waitForTimeout(120);

    const dockBottom = await page.evaluate(() =>
      Math.ceil(document.querySelector(".xw-dock").getBoundingClientRect().bottom));

    const y0 = dockBottom + 2, y1 = vp.h - 2;
    if (y1 <= y0) { await page.close(); continue; }

    const png = PNG.sync.read(await page.screenshot({
      clip: { x: 0, y: y0, width: vp.w, height: y1 - y0 } }));

    const offenders = new Map();
    for (let y = 0; y < png.height; y += 3) {
      for (let x = 0; x < png.width; x += 3) {
        const i = (png.width * y + x) << 2;
        const [r, g, b] = [png.data[i], png.data[i+1], png.data[i+2]];
        const isCanvas = Math.abs(r-251)<3 && Math.abs(g-249)<3 && Math.abs(b-244)<3;
        if (!isCanvas) {
          const key = `rgb(${r},${g},${b})`;
          offenders.set(key, (offenders.get(key) || 0) + 1);
        }
      }
    }
    const bad = offenders.size > 0;
    if (bad) fails++;
    console.log(`${bad ? "FAIL" : "ok  "} ${vp.w}x${vp.h} kb=${kb}  strip y=${y0}..${y1}` +
                (bad ? `  offending colours: ${[...offenders.entries()].slice(0,4).map(([k,v])=>k+"×"+v).join(" ")}` : "  all canvas"));
    await page.close();
  }

  await browser.close();
  await site.close();
  console.log(fails === 0 ? "\nStrip below the dock paints pure canvas." : `\n${fails} viewports leak paint.`);
  process.exit(fails ? 1 : 0);
})();
