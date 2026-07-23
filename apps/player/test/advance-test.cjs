const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

// After filling an entry the cursor should move to the next entry in the
// SAME direction (2A -> 3A), not flip orientation.
(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  const label = () => p.evaluate(() =>
    document.querySelector(".xw-cluetop span").textContent.trim());
  const clue = () => p.evaluate(() =>
    document.querySelector(".xw-cluetext").textContent.trim());

  // MINI 001 solution: across 1A RHO, 4A SEAL, 5A SCARE, 6A PACE, 7A ART
  const acrossAnswers = ["RHO", "SEAL", "SCARE", "PACE", "ART"];

  // Cursor already starts at 1-Across; tapping that same cell would toggle
  // direction, so just raise the keyboard via the toggle instead.
  await p.click(".xw-btn.kbd");
  await p.waitForTimeout(60);

  console.log("start:", await label(), "-", await clue());
  const seen = [await label()];
  for (const word of acrossAnswers) {
    await p.keyboard.type(word);
    await p.waitForTimeout(40);
    seen.push(await label());
  }
  console.log("sequence while filling across:", seen.join(" -> "));

  const flips = seen.filter((x, i) => i > 0 && i < seen.length - 1 && x.endsWith("D"));
  console.log(flips.length === 0
    ? "no orientation flips mid-across"
    : "FLIPPED into: " + flips.join(", "));

  // arrows: should walk the across list, then reach the down list
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");
  const walk = [await label()];
  for (let i = 0; i < 9; i++) {
    await p.click(".xw-nav .xw-arrow:last-child");
    walk.push(await label());
  }
  console.log("arrow order:", walk.join(" "));

  // pill alignment
  const geo = await p.evaluate(() => {
    const bar = document.querySelector(".xw-cluebar").getBoundingClientRect();
    const pill = document.querySelector(".xw-cluetext").getBoundingClientRect();
    const title = document.querySelector(".xw-title").getBoundingClientRect();
    const nav = document.querySelector(".xw-nav").getBoundingClientRect();
    return { barL: bar.left, pillL: pill.left, titleL: title.left, navL: nav.left, barR: bar.right };
  });
  console.log(`pill left ${geo.pillL.toFixed(0)} vs title left ${geo.titleL.toFixed(0)}` +
              ` | nav at ${geo.navL.toFixed(0)} of ${geo.barR.toFixed(0)}`);
  console.log("pill aligns with header title:", Math.abs(geo.pillL - geo.titleL) < 1.5);

  const EXPECTED_ORDER = "Clue 1A Clue 4A Clue 5A Clue 6A Clue 7A Clue 1D Clue 2D Clue 3D Clue 4D Clue 5D";
  const checks = [
    ["no orientation flips mid-across", flips.length === 0],
    ["arrows walk across list then down list", walk.join(" ") === EXPECTED_ORDER],
    ["pill left-aligns with header title", Math.abs(geo.pillL - geo.titleL) < 1.5],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length
    ? `\n${bad.length} advance checks failed.`
    : "\nAuto-advance stays in direction; arrows walk every entry.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
