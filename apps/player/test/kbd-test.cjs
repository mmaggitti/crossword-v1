const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  const state = () => p.evaluate(() => ({
    label: document.querySelector(".xw-btn.kbd").textContent.trim(),
    focused: document.activeElement === document.querySelector(".xw-input"),
    clue: document.querySelector(".xw-cluetop").textContent.trim(),
  }));

  const tapCell = async (n) => {
    const box = await p.locator(".xw-cell").nth(n).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.mouse.up();
    await p.waitForTimeout(50);
  };

  let s = await state();
  console.log("at rest                    ->", s.label, "| focused:", s.focused, "|", s.clue);

  await tapCell(8);
  s = await state();
  console.log("tap a cell (no keyboard)   ->", s.label, "| focused:", s.focused, "|", s.clue);
  console.log("   cursor moved, keyboard stayed down:", !s.focused && s.label === "Keyboard");
  const cTapNoKb = !s.focused && s.label === "Keyboard";

  await p.click(".xw-btn.kbd");
  s = await state();
  console.log("press Keyboard             ->", s.label, "| focused:", s.focused);
  const cRaised = s.label === "Hide" && s.focused;

  const before = (await state()).clue;
  await tapCell(13);
  s = await state();
  console.log("tap a cell while typing    ->", s.label, "| focused:", s.focused, "|", s.clue);
  console.log("   keyboard survived the tap:", s.focused && s.label === "Hide");
  console.log("   cursor still moved:", s.clue !== before);
  const cSurvived = s.focused && s.label === "Hide";
  const cMoved = s.clue !== before;

  await p.click(".xw-btn.kbd");
  s = await state();
  console.log("press Hide                 ->", s.label, "| focused:", s.focused);
  const cHidden = s.label === "Keyboard" && !s.focused;

  const checks = [
    ["cell tap moves cursor without raising keyboard", cTapNoKb],
    ["Keyboard button raises and focuses the input", cRaised],
    ["cell tap while typing keeps the keyboard up", cSurvived],
    ["cell tap while typing still moves the cursor", cMoved],
    ["Hide lowers the keyboard and blurs the input", cHidden],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length ? `\n${bad.length} keyboard checks failed.` : "\nKeyboard raise/dismiss cycle behaves.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
