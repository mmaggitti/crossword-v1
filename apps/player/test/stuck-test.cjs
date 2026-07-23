const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

// Reproduce the wedged state: the input stays focused while the keyboard is
// gone. Before the fix, focus() was a no-op there and cell taps did nothing.
(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  // Count focus transitions on the hidden input.
  await p.evaluate(() => {
    const el = document.querySelector(".xw-input");
    window.__f = 0; window.__b = 0;
    el.addEventListener("focus", () => window.__f++);
    el.addEventListener("blur", () => window.__b++);
  });

  const state = () => p.evaluate(() => ({
    label: document.querySelector(".xw-btn.kbd").textContent.trim(),
    focused: document.activeElement === document.querySelector(".xw-input"),
    focuses: window.__f, blurs: window.__b,
  }));

  const tapCell = async (n) => {
    const box = await p.locator(".xw-cell").nth(n).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.mouse.up();
    await p.waitForTimeout(60);
  };

  await p.click(".xw-btn.kbd");
  await p.waitForTimeout(60);
  console.log("after pressing Keyboard:   ", JSON.stringify(await state()));

  // Wedge it: focused, but no keyboard on screen (kbInset stays 0, as it
  // does when iOS dismisses the keyboard without blurring).
  const wedged = await state();
  console.log("wedged (focused, no kb):   ", JSON.stringify(wedged));

  // The fix: asking for the keyboard in that state must force a real focus
  // transition, since focus() alone is a no-op on an already-focused input.
  const beforeF = wedged.focuses, beforeB = wedged.blurs;
  await p.click(".xw-btn.kbd");
  await p.waitForTimeout(60);
  const after = await state();
  console.log("after asking again:        ", JSON.stringify(after));
  const forced = after.blurs > beforeB && after.focuses > beforeF;
  console.log("forced a blur+refocus:", forced);

  // And the label must not stay stuck on "Hide" when no keyboard is present.
  await p.waitForTimeout(900);
  const selfCorrectLabel = (await state()).label;
  console.log("label after self-correct:  ", selfCorrectLabel);

  const checks = [
    ["asking for the keyboard while wedged forces a real refocus", forced],
    ["label self-corrects to Keyboard when no keyboard appears", selfCorrectLabel === "Keyboard"],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length ? `\n${bad.length} stuck-recovery checks failed.` : "\nWedged focus recovers.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
