const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

// After a failed check you must still be able to reach the keyboard, fix a
// square, and re-check — without the board moving underneath you.
(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  const snap = () => p.evaluate(() => {
    const g = document.querySelector(".xw-gridwrap").getBoundingClientRect();
    const kbd = document.querySelector(".xw-btn.kbd");
    const chk = document.querySelector(".xw-btn:not(.kbd)");
    return {
      gw: +g.width.toFixed(1), gtop: +g.top.toFixed(1),
      kbd: kbd ? kbd.textContent.trim() : null,
      check: chk ? chk.textContent.trim() : null,
      banner: document.querySelector(".xw-banner")?.textContent.trim() ?? null,
      wrongCells: document.querySelectorAll(".xw-cell.wrong").length,
    };
  });

  const before = await snap();
  console.log("at rest:      ", JSON.stringify(before));

  // fill it wrong on purpose
  await p.click(".xw-btn.kbd");
  for (const w of ["RHO", "SEAL", "SCARE", "PACE", "ARX"]) {
    await p.keyboard.type(w); await p.waitForTimeout(20);
  }
  await p.click(".xw-btn.kbd");            // hide keyboard, as a user would
  await p.click(".xw-btn:not(.kbd)");      // check
  await p.waitForTimeout(80);

  const wrong = await snap();
  console.log("after a wrong check:", JSON.stringify(wrong));
  console.log("  keyboard button still reachable:", wrong.kbd !== null);
  console.log("  check button still reachable:   ", wrong.check !== null);
  console.log("  board unmoved:", wrong.gw === before.gw && wrong.gtop === before.gtop);

  // recover: raise the keyboard, fix the square, re-check
  await p.click(".xw-btn.kbd");
  const raised = await snap();
  console.log("  keyboard raised:", raised.kbd === "Hide");

  await p.keyboard.press("Backspace");
  await p.waitForTimeout(60);
  const typed = await snap();
  console.log("  marks cleared on edit:", typed.wrongCells === 0, "| banner gone:", typed.banner === null);

  await p.keyboard.type("T");
  await p.waitForTimeout(60);
  await p.click(".xw-btn:not(.kbd)");
  await p.waitForTimeout(80);
  const fixed = await snap();
  console.log("  after fixing and re-checking:", JSON.stringify(fixed.banner));

  const after = await snap();
  console.log("  board still unmoved:", after.gw === before.gw);

  const checks = [
    ["keyboard button still reachable after a failed check", wrong.kbd !== null],
    ["check button still reachable after a failed check", wrong.check !== null],
    ["board doesn't move on a failed check", wrong.gw === before.gw && wrong.gtop === before.gtop],
    ["keyboard raises again for the fix", raised.kbd === "Hide"],
    ["editing clears wrong marks and the banner", typed.wrongCells === 0 && typed.banner === null],
    ["re-checking a fixed grid reports solved", !!fixed.banner && /Solved/i.test(fixed.banner)],
    ["board doesn't move through the whole recovery", after.gw === before.gw],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length ? `\n${bad.length} wrong-recovery checks failed.` : "\nFailed-check recovery works.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
