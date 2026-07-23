const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

const ANSWERS = ["RHO", "SEAL", "SCARE", "PACE", "ART"];   // the across list

(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  const grid = () => p.evaluate(() => {
    const g = document.querySelector(".xw-gridwrap").getBoundingClientRect();
    return { w: +g.width.toFixed(1), h: +g.height.toFixed(1), top: +g.top.toFixed(1) };
  });

  const before = await grid();
  console.log("board before solving:", JSON.stringify(before));

  await p.click(".xw-btn.kbd");
  for (const w of ANSWERS) { await p.keyboard.type(w); await p.waitForTimeout(30); }
  await p.click(".xw-btn:not(.kbd)");            // Check puzzle
  await p.waitForTimeout(60);

  const stamp = await p.evaluate(() => {
    const el = document.querySelector(".xw-solve");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const g = document.querySelector(".xw-gridwrap").getBoundingClientRect();
    return { text: el.textContent, bg: cs.backgroundColor, fg: cs.color,
             size: cs.fontSize, dur: cs.animationDuration,
             coversBoard: Math.abs(r.width - g.width) < 6 && Math.abs(r.height - g.height) < 6 };
  });
  console.log("stamp:", JSON.stringify(stamp));
  const during = await grid();
  console.log("board during stamp:", JSON.stringify(during),
              "| unchanged:", during.w === before.w && during.h === before.h && during.top === before.top);

  await p.waitForTimeout(1700);
  const mark = await p.evaluate(() => {
    const el = document.querySelector(".xw-solved-mark");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const g = document.querySelector(".xw-gridwrap").getBoundingClientRect();
    const st = document.querySelector(".xw-stage").getBoundingClientRect();
    return { text: el.textContent, fg: cs.color, size: cs.fontSize,
             belowBoard: r.top >= g.bottom - 1,
             centred: Math.abs((r.left + r.right) / 2 - (st.left + st.right) / 2) < 2,
             insideStage: r.bottom <= st.bottom + 1 };
  });
  const stampGone = !(await p.$(".xw-solve"));
  console.log("stamp gone:", stampGone);
  console.log("mark:", JSON.stringify(mark));

  const after = await grid();
  console.log("board after:", JSON.stringify(after),
              "| unchanged:", after.w === before.w && after.h === before.h && after.top === before.top);

  await p.screenshot({ path: require("path").join(require("os").tmpdir(), "shot-solved.png") });

  const unchanged = (x) => x.w === before.w && x.h === before.h && x.top === before.top;
  const checks = [
    ["board doesn't move while the SOLVED stamp shows", unchanged(during)],
    ["stamp covers the board and reads SOLVED", !!stamp && stamp.coversBoard && stamp.text === "SOLVED"],
    ["stamp clears after its animation", stampGone],
    ["persistent mark sits below the board, centred, in-stage",
      !!mark && mark.belowBoard && mark.centred && mark.insideStage && mark.text === "SOLVED"],
    ["board doesn't move after solving", unchanged(after)],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length ? `\n${bad.length} solve checks failed.` : "\nBoth solve phases keep the board stable.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
