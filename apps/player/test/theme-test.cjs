/* The purple theme — /crossword-v1/purple/.
 *
 * The theme is pure CSS (a .theme-purple block in TOKENS applied to <html> by
 * main.jsx), so this needs no second build: load the ordinary dist/, add the
 * class, and read the values back out.
 *
 * Everything here asserts USED values — the "rgb(r, g, b)" every engine
 * normalises a resolved colour to — never the raw custom-property text.
 * getPropertyValue("--accent") would hand back the author's token stream,
 * whitespace and all, which differs between engines and would only prove the
 * string survived the bundler. Reading the used value proves the thing that
 * can actually break: that the ancestor-class override won the cascade and the
 * var() chain resolved.
 *
 * The two contrast assertions are the point of the suite. Vivid #A100FF against
 * its own #E6DCFF tint is 4.05:1 — under AA in BOTH directions — so the palette
 * re-points --accent-ink (text on a tint) and --on-accent-quiet (quiet text on
 * an accent fill). If someone later "simplifies" those back to var(--accent),
 * these fail.
 */
const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

const channels = (css) => {
  const m = String(css).match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(",").slice(0, 3).map((n) => parseFloat(n) / 255);
  return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16) / 255);
};
const rl = (css) => {
  const c = channels(css).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [rl(a), rl(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const PURPLE = {
  accent: "rgb(161, 0, 255)",   // #A100FF
  deep: "rgb(117, 0, 192)",     // #7500C0
  white: "rgb(255, 255, 255)",  // --surface
};

(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  const checks = [];
  const ok = (name, cond) => checks.push([name, !!cond]);

  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  // --- green first: the default build must be untouched by the theme work ---
  const green = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".xw-cluetext"));
    return { fg: cs.color, bg: cs.backgroundColor };
  });
  ok("default build is still green (#076B3B pill text)", green.fg === "rgb(7, 107, 59)");
  ok("green pill still meets AA", contrast(green.fg, green.bg) >= 4.5);

  // --- apply the theme exactly as main.jsx does on the purple build ---------
  await p.evaluate(() => document.documentElement.classList.add("theme-purple"));
  // .xw-cell carries a 120ms background-color/color transition, so a swap read
  // too early samples a blend of the two palettes (green->purple mid-flight).
  await p.waitForTimeout(400);

  const read = () => p.evaluate(() => {
    const pill = getComputedStyle(document.querySelector(".xw-cluetext"));
    const cursor = document.querySelector(".xw-cell.cursor");
    const num = cursor && cursor.querySelector(".xw-num");
    const root = getComputedStyle(document.querySelector(".xw"));
    return {
      pillFg: pill.color,
      pillBg: pill.backgroundColor,
      cursorBg: cursor ? getComputedStyle(cursor).backgroundColor : null,
      cursorLetter: cursor ? getComputedStyle(cursor).color : null,
      numFg: num ? getComputedStyle(num).color : null,
      canvas: root.getPropertyValue("--canvas").trim(),
    };
  });

  const t = await read();
  console.log("purple pill:", t.pillFg, "on", t.pillBg);
  console.log("purple cursor:", t.cursorLetter, "on", t.cursorBg, "| number:", t.numFg);

  // The ramp actually took effect (cascade + specificity + var() chain).
  ok("cursor cell fills with vivid accent #A100FF", t.cursorBg === PURPLE.accent);
  ok("pill tint is the purple softest, not the green one", t.pillBg === "rgb(230, 220, 255)");

  // Contrast fix #1 — accent as TEXT on a tint drops to accent-deep.
  ok("clue pill text is accent-deep #7500C0, not vivid accent", t.pillFg === PURPLE.deep);
  const pillC = contrast(t.pillFg, t.pillBg);
  console.log(`  pill contrast ${pillC.toFixed(2)}:1 (vivid accent would be 4.05)`);
  ok("purple pill meets AA (>=4.5) measured from the DOM", pillC >= 4.5);

  // Contrast fix #2 — quiet text on an accent FILL goes white.
  if (t.numFg) {
    ok("cell number under the cursor is white, not the pale tint", t.numFg === PURPLE.white);
    const numC = contrast(t.numFg, t.cursorBg);
    console.log(`  cursor-number contrast ${numC.toFixed(2)}:1 (pale tint would be 4.05)`);
    ok("cursor number meets AA (>=4.5)", numC >= 4.5);
  } else {
    console.log("  (no numbered cell under the cursor in this sample — skipped)");
  }
  ok("cursor letter stays white on the accent fill", t.cursorLetter === PURPLE.white);
  ok("cursor letter meets AA", contrast(t.cursorLetter, t.cursorBg) >= 4.5);

  // The neutrals are shared between both columns. If a theme ever moved one,
  // paint-test.cjs (which asserts rgb(251,249,244)) and the PWA manifest's
  // theme_color would silently disagree with the app.
  ok("theme leaves --canvas alone (#FBF9F4)", /^#FBF9F4$/i.test(t.canvas));

  const bad = checks.filter(([, pass]) => !pass);
  for (const [name, pass] of checks) console.log(`${pass ? "ok   " : "FAIL "}${name}`);
  console.log(bad.length ? `\n${bad.length} theme checks failed.` : "\nPurple theme holds, green untouched.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
