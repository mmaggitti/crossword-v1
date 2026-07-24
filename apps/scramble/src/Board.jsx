/* The scramble board.
 *
 * This is deliberately NOT the engine's GridDOM. The player's renderer is
 * built around a typing cursor; here tiles are objects you move, with a gap,
 * a tray, and selection state. Sharing one renderer would distort both, so
 * they share the design tokens and the parsed geometry instead.
 *
 * Like GridDOM this measures nothing in JavaScript — the cell size falls out
 * of container-query units on the stage, so the board can't fight the layout.
 */

export const SCRAMBLE_CSS = `
.xws { overflow: hidden; }

.xws-head {
  flex: 0 0 auto; display: flex; align-items: center; gap: var(--space-sm);
  padding: calc(var(--space-md) + env(safe-area-inset-top, 0px)) var(--space-lg) var(--space-sm);
}
.xws-back {
  flex: 0 0 auto; font: inherit; font-family: var(--mono);
  font-size: var(--text-xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--accent-deep); background: var(--surface);
  border: var(--hairline) solid var(--border); border-radius: var(--radius);
  padding: var(--space-xs) var(--space-sm); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.xws-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-family: var(--mono); font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--accent-deepest); font-size: var(--text-lg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.xws-mode { flex: 0 0 auto; font-family: var(--mono); font-size: var(--text-xs); color: var(--muted); }

.xws-stage {
  flex: 1 1 auto; min-height: 0; container-type: size;
  display: flex; align-items: center; justify-content: center;
  padding: 0 var(--space-lg);
}
.xws-grid {
  display: grid;
  width: min(100cqw, calc(100cqh * var(--cols) / var(--rows)));
  aspect-ratio: var(--cols) / var(--rows);
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: max(1px, calc(var(--u) * 0.06));
  font-size: calc(min(100cqw, calc(100cqh * var(--cols) / var(--rows))) / var(--cols) * 0.46);
}
.xws-cell {
  position: relative; display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); color: var(--ink); line-height: 1;
  border-radius: calc(var(--radius) * 0.6);
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.xws-cell.blk { background: var(--accent-deepest); }
.xws-cell.gap { background: var(--canvas); border: max(1px, calc(var(--u) * 0.05)) dashed var(--border); }
.xws-cell.tile {
  background: var(--surface); border: var(--hairline) solid var(--border); cursor: pointer;
}
.xws-cell.home { background: var(--accent-softest); color: var(--accent-deepest); }
.xws-cell.sel { border: max(2px, calc(var(--u) * 0.09)) solid var(--accent); }
.xws-cell.mov { border: max(1px, calc(var(--u) * 0.06)) solid var(--accent-soft); }
.xws-n {
  position: absolute; top: 4%; left: 6%;
  font-family: var(--sans); font-size: var(--text-xs); color: var(--muted); line-height: 1;
}

.xws-tray {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  gap: var(--space-sm); padding: var(--space-sm) var(--space-lg) 0;
  min-height: calc(var(--u) * 2.4);
  font-family: var(--sans); font-size: var(--text-sm); color: var(--muted);
}
.xws-traytile {
  font: inherit; font-family: var(--mono); font-size: var(--text-xl);
  width: calc(var(--u) * 2.1); height: calc(var(--u) * 2.1);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface); color: var(--ink);
  border: var(--hairline) solid var(--border); border-radius: calc(var(--radius) * 0.6);
  cursor: default; -webkit-tap-highlight-color: transparent;
}
.xws-traytile.ready {
  background: var(--accent-softest); color: var(--accent-deepest);
  border-color: var(--accent); cursor: pointer;
}

.xws-clues {
  flex: 0 0 auto; max-height: 24%; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: var(--space-sm) var(--space-lg) 0;
  font-family: var(--sans); font-size: var(--text-sm); color: var(--ink); line-height: 1.5;
}
.xws-pool { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.xws-chip {
  padding: calc(var(--space-xs) * 0.9) var(--space-sm);
  background: var(--surface); border: var(--hairline) solid var(--border);
  border-radius: 999px;
}
.xws-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
.xws-cols b { font-family: var(--mono); color: var(--accent-deep); font-weight: 600; }

.xws-dock {
  flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg) calc(var(--space-md) + env(safe-area-inset-bottom, 0px));
}
.xws-row { display: flex; gap: var(--space-xs); align-items: center; }
.xws-btn {
  flex: 1 1 0; min-width: 0; font: inherit; font-family: var(--sans); font-size: var(--text-sm);
  padding: var(--space-sm) var(--space-xs);
  background: var(--surface); color: var(--accent-deep);
  border: var(--hairline) solid var(--border); border-radius: var(--radius);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.xws-btn.on {
  background: var(--accent-softest); border-color: var(--accent);
  color: var(--accent-deepest); font-weight: 600;
}
.xws-btn:disabled { opacity: .45; cursor: default; }
.xws-label { flex: 0 0 auto; font-family: var(--sans); font-size: var(--text-xs); color: var(--muted); }
.xws-status {
  display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-sm);
  font-family: var(--sans); font-size: var(--text-sm); color: var(--muted);
  min-height: calc(var(--u) * 1.2);
}
.xws-status .done { color: var(--accent); font-weight: 600; }
`;

export default function Board({ model, state, sel, movable, onCell, solved }) {
  const { rows, cols, solution, cellIndex } = model;
  const cells = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (solution[r][c] === null) {
        cells.push(<div key={key} className="xws-cell blk" />);
        continue;
      }
      const value = state.board[r][c];
      if (value === "") {
        cells.push(<div key={key} className="xws-cell gap" />);
        continue;
      }
      const number = cellIndex[r][c]?.number ?? null;
      const cls = ["xws-cell", "tile"];
      if (value === solution[r][c]) cls.push("home");
      if (sel && sel[0] === r && sel[1] === c) cls.push("sel");
      if (movable && movable.has(key)) cls.push("mov");

      cells.push(
        <div
          key={key}
          className={cls.join(" ")}
          data-r={r}
          data-c={c}
          onClick={solved ? undefined : () => onCell(r, c)}
        >
          {number != null && <span className="xws-n">{number}</span>}
          {value}
        </div>
      );
    }
  }

  return (
    <div className="xws-stage">
      <div
        className="xws-grid"
        style={{ "--cols": cols, "--rows": rows }}
        role="grid"
        aria-label="Scrambled crossword board"
      >
        {cells}
      </div>
    </div>
  );
}
