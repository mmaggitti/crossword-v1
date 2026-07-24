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

  // --- 3x3 size toggle (hidden control in the header) ----------------------
  ok("size caption reads 5x5 by default", /5\D5/.test((await page.locator(".xws-size").textContent()).trim()));
  await page.locator(".xws-size").click();
  await page.waitForTimeout(80);
  ok("tapping the caption switches to 3x3", /3\D3/.test((await page.locator(".xws-size").textContent()).trim()));
  ok("3x3 renders 9 cells", (await page.locator(".xws-cell").count()) === 9);
  ok("toggle has no button chrome", await page.locator(".xws-size").evaluate((el) => getComputedStyle(el).borderTopWidth === "0px"));
  await page.locator(".xws-size").click();
  await page.waitForTimeout(80);
  ok("tapping again returns to 5x5", (await page.locator(".xws-cell").count()) === 25);

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
  ok("the move is counted", (await page.locator(".xws-moves").textContent()).trim() === "1");

  // Undo must put the gap back.
  await btn("Undo").click();
  await page.waitForTimeout(80);
  const gapUndone = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".xws-cell")];
    return all.indexOf(document.querySelector(".xws-cell.gap"));
  });
  ok("undo restores the gap", gapUndone === gapBefore);
  ok("undo decrements the counter", (await page.locator(".xws-moves").textContent()).trim() === "0");

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

  // --- None mode reveals found clues in their by-location slots ------------
  // Everything is solved now, so None shows all 10 clues in the numbered columns
  // layout, each revealed (green), with no pending (dim, textless) slots left.
  await btn("None").click();
  await page.waitForTimeout(60);
  ok("None uses the by-location columns layout", (await page.locator(".xws-cols").count()) === 1);
  ok("None reveals every found clue in place", (await page.locator(".xws-cols .got").count()) === 10);
  ok("no pending slots once every word is found", (await page.locator(".xws-cols .pending").count()) === 0);

  // --- cyclic mode ---------------------------------------------------------
  // The seamless-wrap render and the spring/momentum feel are device-verified
  // (like the iOS keyboard); here we prove the wiring: it renders, hides the
  // numbers, and a drag on a row commits a shift.
  await btn("Cyclic").click();
  await page.waitForTimeout(150);
  ok("cyclic renders all 25 cells", (await page.locator(".xws-cell").count()) === 25);
  ok("cyclic hides cell numbers", (await page.locator(".xws-n").count()) === 0);
  ok("cyclic prompts a drag", /drag a row or column/i.test(await page.locator(".xws-status").textContent()));

  const gb = await page.locator(".xws-grid").boundingBox();
  const cw = gb.width / 5;
  const midY = gb.y + gb.height * 0.5;
  const x0 = gb.x + gb.width * 0.3;
  await page.mouse.move(x0, midY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(x0 + cw * 1.4 * (i / 6), midY); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(800);   // let the snap spring settle and commit
  ok("a cyclic drag commits a move", Number((await page.locator(".xws-moves").textContent()).trim()) >= 1);

  // A Locked drag on a BLOCK-BEARING row (row 0 = ..CAP) exercises the per-tile
  // carousel where blocks partition the line (k < n) — letters cycle, blocks pin.
  {
    const movesBefore = Number((await page.locator(".xws-moves").textContent()).trim());
    const row0Y = gb.y + gb.height * 0.1;
    const sx = gb.x + gb.width * 0.5;
    await page.mouse.move(sx, row0Y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(sx + cw * 1.4 * (i / 6), row0Y); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(800);
    ok("a Locked drag on a block-bearing row commits", Number((await page.locator(".xws-moves").textContent()).trim()) > movesBefore);
    const r0 = await page.evaluate(() => {
      const cs = [...document.querySelectorAll(".xws-grid > .xws-cell")];
      return [cs[0].classList.contains("blk"), cs[1].classList.contains("blk")];
    });
    ok("Locked drag keeps row-0 blocks pinned (cols 0,1)", r0[0] && r0[1]);
  }

  // --- Empties: Locked / Unlocked (the movable-set toggle) -----------------
  // Still in Cyclic on the 5x5. The row only appears on puzzles with blocks.
  const solBlockKeys = [];
  for (let r = 0; r < solution.length; r++)
    for (let c = 0; c < solution[r].length; c++)
      if (solution[r][c] === null) solBlockKeys.push(`${r},${c}`);
  solBlockKeys.sort();
  const currentBlocks = () => page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll(".xws-grid > .xws-cell")].forEach((el, n) => {
      if (el.classList.contains("blk")) out.push(`${Math.floor(n / 5)},${n % 5}`);
    });
    return out.sort();
  });
  ok("Empties row appears (Locked + Unlocked)", (await btn("Locked").count()) === 1 && (await btn("Unlocked").count()) === 1);
  ok("cyclic Locked: 6 blocks pinned to solution positions",
     JSON.stringify(await currentBlocks()) === JSON.stringify(solBlockKeys));

  await btn("Unlocked").click();
  await page.waitForTimeout(120);
  const unlockedBlocks = await currentBlocks();
  ok("cyclic Unlocked: still 6 blocks", unlockedBlocks.length === 6);
  ok("cyclic Unlocked: at least one block has travelled off its solution cell",
     JSON.stringify(unlockedBlocks) !== JSON.stringify(solBlockKeys));
  ok("toggling Empties re-scrambles (move counter back to 0)",
     (await page.locator(".xws-moves").textContent()).trim() === "0");

  // Unlocked Swap: a block becomes a selectable, movable token.
  await btn("Swap").click();
  await page.waitForTimeout(80);
  ok("Unlocked swap: all 6 block cells are interactive", (await page.locator(".xws-cell.blk[data-r]").count()) === 6);
  await page.locator(".xws-cell.blk[data-r]").first().click();
  await page.waitForTimeout(80);
  ok("Unlocked swap: clicking a block selects it", (await page.locator(".xws-cell.blk.sel").count()) === 1);

  // Back to Locked so the hint section runs against the original behavior.
  await btn("Locked").click();
  await page.waitForTimeout(100);
  ok("Locked swap: blocks are inert again (no data-r)", (await page.locator(".xws-cell.blk[data-r]").count()) === 0);

  // --- hint solver: next move + minimum count ------------------------------
  // Swap (analytic, always solvable): the hint names two tiles and a minimum
  // count; following that swap must drop the minimum by exactly one.
  await btn("Swap").click();
  await page.waitForTimeout(80);
  await btn("Hint").click();
  await page.waitForTimeout(80);
  ok("hint surfaces a next move", /💡/.test(await page.locator(".xws-status .hinting").textContent()));
  const n0 = parseInt((await page.locator(".xws-status .hintcount").textContent()).trim(), 10);
  ok("hint shows a minimum move count", Number.isFinite(n0) && n0 >= 2);
  ok("swap hint highlights exactly two tiles", (await page.locator(".xws-cell.hint").count()) === 2);
  const hc = await page.evaluate(() =>
    [...document.querySelectorAll(".xws-cell.hint")].map((el) => [el.getAttribute("data-r"), el.getAttribute("data-c")])
  );
  await page.click(`.xws-cell[data-r="${hc[0][0]}"][data-c="${hc[0][1]}"]`);
  await page.click(`.xws-cell[data-r="${hc[1][0]}"][data-c="${hc[1][1]}"]`);
  await page.waitForTimeout(80);
  ok("making a move clears the stale hint", (await page.locator(".xws-cell.hint").count()) === 0);
  await btn("Hint").click();
  await page.waitForTimeout(80);
  const n1 = parseInt((await page.locator(".xws-status .hintcount").textContent()).trim(), 10);
  ok("following the hint reduces the minimum by exactly one", n1 === n0 - 1);

  // Cyclic on the 3x3 (a fresh 5x5 cyclic is too deep for the solver's budget):
  // the hint highlights a whole line to slide and reports a minimum.
  await page.locator(".xws-size").click();          // 5x5 -> 3x3
  await page.waitForTimeout(80);
  await btn("Cyclic").click();
  await page.waitForTimeout(120);
  await btn("Hint").click();
  await page.waitForTimeout(120);
  const cy = parseInt((await page.locator(".xws-status .hintcount").textContent()).trim(), 10);
  ok("cyclic 3x3 hint shows a minimum count", Number.isFinite(cy) && cy >= 1);
  ok("cyclic hint outlines the whole line as one frame", (await page.locator(".xws-hintline").count()) === 1);
  ok("cyclic hint uses no per-cell rings", (await page.locator(".xws-cell.hint").count()) === 0);

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
