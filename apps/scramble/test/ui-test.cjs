/* UI suite for the scramble app, against the served Vite build.
 *
 * mechanics-test.cjs proves the move system in isolation; this proves the
 * app is actually wired to it — the board renders, both mechanics respond to
 * taps, the clue modes switch, and a real solve reaches the win state.
 *
 * The solve is genuine: it reads the board out of the DOM and swaps each cell
 * into place one click at a time (awaiting between clicks so React re-renders),
 * which exercises the whole loop end to end rather than faking a solved state.
 */
const { chromium } = require("playwright");
const { serve } = require("./_serve.cjs");
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "../dist");
const MINI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../packages/clue-data/minis/mini-001.json"), "utf8")
);

// Mirrors parsePuzzle's block handling, so the harness knows the target grid.
function solutionOf(p) {
  const out = [];
  for (let r = 0; r < p.size.rows; r++) {
    const src = String(p.grid[r] ?? "").toUpperCase();
    const row = [];
    for (let c = 0; c < p.size.cols; c++) {
      const ch = src[c] ?? ".";
      row.push(ch === "." || ch === "#" || ch === " " ? null : ch);
    }
    out.push(row);
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const site = await serve(DIST);
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const checks = [];
  const ok = (name, cond) => checks.push([name, !!cond]);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(site.url + "#sample");
  await page.waitForSelector(".xws-grid");

  const solution = solutionOf(MINI);
  const openCells = [];
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (solution[r][c] !== null) openCells.push([r, c]);
    }
  }

  const btn = (label) => page.locator(".xws-btn").filter({ hasText: label }).first();
  const readBoard = () =>
    page.evaluate(() => {
      const out = {};
      document.querySelectorAll(".xws-cell.tile").forEach((el) => {
        const r = el.getAttribute("data-r");
        const c = el.getAttribute("data-c");
        if (r != null) out[`${r},${c}`] = el.textContent.replace(/^\d+/, "");
      });
      return out;
    });

  // --- render --------------------------------------------------------------
  ok("25 cells rendered", (await page.locator(".xws-cell").count()) === 25);
  ok("6 blocks rendered", (await page.locator(".xws-cell.blk").count()) === 6);
  ok("19 tiles in swap mode (fully packed)", (await page.locator(".xws-cell.tile").count()) === openCells.length);
  ok("board is not already solved", (await page.locator(".xws-status .done").count()) === 0);

  // --- clue modes ----------------------------------------------------------
  ok("clues hidden by default", (await page.locator(".xws-clues").count()) === 0);
  await btn("Jumbled").click();
  const chips = await page.locator(".xws-chip").allTextContents();
  ok("jumbled shows all 10 clues as chips", chips.length === 10);
  ok("jumbled chips carry no number labels", chips.every((t) => !/^\s*\d+[AD]/.test(t)));
  await btn("Labeled").click();
  ok("labeled lists 10 numbered entries", (await page.locator(".xws-cols div div").count()) === 10);
  await btn("None").click();
  ok("clues hide again", (await page.locator(".xws-clues").count()) === 0);

  // --- slide mechanic ------------------------------------------------------
  await btn("Slide").click();
  await page.waitForTimeout(80);
  ok("slide has exactly one gap", (await page.locator(".xws-cell.gap").count()) === 1);
  ok("slide has 18 tiles (one letter in the tray)", (await page.locator(".xws-cell.tile").count()) === openCells.length - 1);
  ok("tray holds a letter", (await page.locator(".xws-traytile").count()) === 1);

  const movable = await page.locator(".xws-cell.mov").count();
  ok("slide highlights between 2 and 4 movable tiles", movable >= 2 && movable <= 4);

  const gapBefore = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".xws-cell")];
    return all.indexOf(document.querySelector(".xws-cell.gap"));
  });
  await page.locator(".xws-cell.mov").first().click();
  await page.waitForTimeout(80);
  const gapAfter = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".xws-cell")];
    return all.indexOf(document.querySelector(".xws-cell.gap"));
  });
  ok("sliding a tile moves the gap", gapBefore !== gapAfter);
  ok("the move is counted", /Moves: 1/.test(await page.locator(".xws-status").textContent()));

  // Undo must put the gap back.
  await btn("Undo").click();
  await page.waitForTimeout(80);
  const gapUndone = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".xws-cell")];
    return all.indexOf(document.querySelector(".xws-cell.gap"));
  });
  ok("undo restores the gap", gapUndone === gapBefore);
  ok("undo decrements the counter", /Moves: 0/.test(await page.locator(".xws-status").textContent()));

  // --- a real solve, in swap mode -----------------------------------------
  await btn("Swap").click();
  await page.waitForTimeout(80);

  for (let i = 0; i < openCells.length; i++) {
    const [r, c] = openCells[i];
    const board = await readBoard();
    if (board[`${r},${c}`] === solution[r][c]) continue;
    let donor = null;
    // Only borrow from cells not yet finalised, so placed letters stay placed.
    for (let j = i + 1; j < openCells.length; j++) {
      const [r2, c2] = openCells[j];
      if (board[`${r2},${c2}`] === solution[r][c]) { donor = [r2, c2]; break; }
    }
    if (!donor) break;
    await page.click(`.xws-cell[data-r="${r}"][data-c="${c}"]`);
    await page.click(`.xws-cell[data-r="${donor[0]}"][data-c="${donor[1]}"]`);
  }
  await page.waitForTimeout(120);

  ok("every tile reads as home after solving", (await page.locator(".xws-cell.home").count()) === openCells.length);
  const done = await page.locator(".xws-status .done").count();
  ok("win state is announced", done === 1);
  if (done) {
    const text = await page.locator(".xws-status .done").textContent();
    ok("win text reports a move count", /Solved in \d+ moves/.test(text));
    console.log("   " + text.trim());
  }

  ok("no uncaught page errors", errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log("   " + e));

  // --- report --------------------------------------------------------------
  await browser.close();
  await site.close();
  const bad = checks.filter(([, pass]) => !pass);
  for (const [name, pass] of checks) console.log(`${pass ? "ok   " : "FAIL "}${name}`);
  console.log(bad.length ? `\n${bad.length} scramble UI checks failed.` : "\nScramble app wired end to end.");
  process.exit(bad.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
