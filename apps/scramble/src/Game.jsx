import { useMemo, useRef, useState } from "react";
import { parsePuzzle, TOKENS } from "@crossword/core";
import Board, { SCRAMBLE_CSS } from "./Board.jsx";
import {
  applyMove,
  isSolved,
  legalMoves,
  scrambleUnsolved,
} from "./mechanics.js";
import { useCyclicDrag } from "./useCyclicDrag.js";

// Each mechanic is a self-contained mode, and together they read as a
// difficulty ladder. Switching re-scrambles rather than converting the board,
// because a puzzle is only guaranteed solvable by the mechanic that shuffled it.
const MODES = [
  { id: "swap", label: "Swap", note: "easy", hint: "tap two tiles" },
  { id: "slide", label: "Slide", note: "med", hint: "tap a tile by the gap" },
  // Blocks travel with their line, so cyclic is well-defined on any grid.
  { id: "cyclic", label: "Cyclic", note: "hard", hint: "drag a row or column" },
];

const CLUE_MODES = [
  { id: "none", label: "None" },
  { id: "jumbled", label: "Jumbled" },
  { id: "labeled", label: "Labeled" },
];

// Stable pseudo-shuffle: the jumbled pool must not reorder on every render,
// but should look unordered and differ per puzzle.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function Game({ puzzle, puzzle3, onExit }) {
  // 5x5 by default; the header size indicator toggles to the paired 3x3 (an
  // easier version) and back. Switching size re-parses and re-scrambles.
  const [size, setSize] = useState(5);
  const active = size === 3 && puzzle3 ? puzzle3 : puzzle;
  const model = useMemo(() => parsePuzzle(active), [active]);
  const [mechanic, setMechanic] = useState("swap");
  const [clueMode, setClueMode] = useState("none");
  const [game, setGame] = useState(null);
  const [scrambleKey, setScrambleKey] = useState("");
  const [history, setHistory] = useState([]);
  const [moves, setMoves] = useState(0);
  const [sel, setSel] = useState(null);
  const gridRef = useRef(null);

  // Re-scramble when the active puzzle or mechanic changes. Done during render
  // (not in an effect) so `game` is never a frame out of sync with the grid —
  // e.g. toggling a 3x3 back to a 5x5 would otherwise index a 5-row model into
  // a 3-row board and crash before an effect could catch up.
  const wantKey = `${active.id}:${mechanic}`;
  if (scrambleKey !== wantKey) {
    setScrambleKey(wantKey);
    setGame(scrambleUnsolved(model.solution, mechanic).state);
    setHistory([]);
    setMoves(0);
    setSel(null);
  }

  // `game` briefly belongs to the previous puzzle/size right after a toggle
  // (the reset above is queued, not yet applied). Guard every derived value
  // until it catches up, or a 3x3 board gets indexed by a 5x5 model and crashes.
  const ready = !!game && game.board.length === model.rows;
  const solved = ready ? isSolved(game, model.solution) : false;

  // Slide: highlight the tiles that can actually move into the gap.
  const movable = useMemo(() => {
    if (!ready || game.mechanic !== "slide" || solved) return null;
    const set = new Set();
    for (const move of legalMoves(game, model.solution)) {
      if (move.type === "slide") set.add(`${move.from[0]},${move.from[1]}`);
    }
    return set;
  }, [game, model, solved]);

  const trayReady =
    !!game && game.tray != null && !!game.gap && !!game.gapHome &&
    game.gap[0] === game.gapHome[0] && game.gap[1] === game.gapHome[1];

  const commit = (next) => {
    setHistory((h) => [...h, game]);
    setGame(next);
    setMoves((m) => m + 1);
  };

  // Cyclic: a drag commits one move (Undo reverts the whole drag).
  const onShift = (axis, index, steps) => {
    if (!steps) return;
    const dir = steps > 0 ? 1 : -1;
    let g = game;
    for (let k = 0; k < Math.abs(steps); k++) g = applyMove(g, { type: "shift", axis, index, dir });
    commit(g);
  };
  const cyclic = useCyclicDrag({
    gridRef,
    rows: model.rows,
    cols: model.cols,
    enabled: !!game && game.mechanic === "cyclic" && !solved,
    onShift,
  });

  const onCell = (r, c) => {
    if (!game || solved) return;

    if (game.mechanic === "swap") {
      if (!sel) { setSel([r, c]); return; }
      if (sel[0] === r && sel[1] === c) { setSel(null); return; }
      commit(applyMove(game, { type: "swap", a: sel, b: [r, c] }));
      setSel(null);
      return;
    }

    // slide: only a tile orthogonally adjacent to the gap may move.
    const legal = legalMoves(game, model.solution).some(
      (m) => m.type === "slide" && m.from[0] === r && m.from[1] === c
    );
    if (legal) commit(applyMove(game, { type: "slide", from: [r, c] }));
  };

  const onTray = () => {
    if (!game || solved || !trayReady) return;
    commit(applyMove(game, { type: "place" }));
  };

  const undo = () => {
    if (!history.length || solved) return;
    setGame(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
    setSel(null);
  };

  const shuffle = () => {
    setGame(scrambleUnsolved(model.solution, mechanic).state);
    setHistory([]);
    setMoves(0);
    setSel(null);
  };

  // Jumbled = every clue, no numbers, no across/down, no order — the clue
  // layer scrambled to match the board. Labeled is the ordinary numbered list.
  const jumbled = useMemo(() => {
    return model.entries
      .map((e) => ({ e, k: hash(`${active.id}:${e.id}`) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.e);
  }, [model, active.id]);

  // An entry is "found" once every one of its cells shows the right letter.
  // Completing a word reveals its clue in green; in None mode they fill in.
  const found = useMemo(() => {
    const s = new Set();
    if (!ready) return s;
    for (const e of model.entries) {
      if (e.cells.every(({ r, c }) => game.board[r]?.[c] === model.solution[r][c])) s.add(e.id);
    }
    return s;
  }, [game, model, ready]);

  const mode = MODES.find((m) => m.id === mechanic);

  // Bail until `game` matches the current model — the during-render reset above
  // will have queued a fresh scramble and re-rendered.
  if (!ready) return null;

  return (
    <div className="xw xws">
      <style>{TOKENS}</style>
      <style>{SCRAMBLE_CSS}</style>

      <header className="xws-head">
        {onExit && (
          <button className="xws-back" onClick={onExit}>‹ Puzzles</button>
        )}
        <h1 className="xws-title">{model.title}</h1>
        <div className="xws-headright">
          {/* Looks like plain text; tapping it toggles 5x5 <-> 3x3. Deliberately
              undecorated (a hidden control) — this is a dev surface. */}
          <button
            className="xws-size"
            onClick={() => puzzle3 && setSize(size === 3 ? 5 : 3)}
            aria-label={puzzle3
              ? `${model.cols}×${model.rows}. Switch to ${size === 3 ? "5×5" : "3×3"}`
              : `${model.cols}×${model.rows}`}
          >
            {model.cols}×{model.rows}
          </button>
          <span className="xws-moves" aria-label={`${moves} moves`}>{moves}</span>
        </div>
      </header>

      {(clueMode !== "none" || found.size > 0) && (
        <div className="xws-clues">
          {clueMode === "jumbled" ? (
            // Jumbled: every clue, no order, no labels — each turns green once found.
            <div className="xws-pool">
              {jumbled.map((e) => (
                <span className={`xws-chip${found.has(e.id) ? " got" : ""}`} key={e.id}>{e.clue}</span>
              ))}
            </div>
          ) : (
            // Labeled lists every clue by its location. None shares the same
            // by-location layout but keeps each clue's text hidden until its word is
            // found, so a found clue pops in at its correct slot (the number anchors
            // the position). Unfound None slots show only their dim number.
            <div className="xws-cols">
              {["across", "down"].map((dir) => (
                <div key={dir}>
                  {model.entries.filter((e) => e.dir === dir).map((e) => {
                    const got = found.has(e.id);
                    const show = clueMode === "labeled" || got;
                    return (
                      <div key={e.id} className={got ? "got" : show ? "" : "pending"}>
                        <b>{e.number}{dir === "across" ? "A" : "D"}</b>{show ? ` ${e.clue}` : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Board
        model={model}
        state={game}
        sel={sel}
        movable={movable}
        onCell={onCell}
        solved={solved}
        bind={cyclic.bind}
        active={cyclic.active}
        offset={cyclic.offset}
        gridRef={gridRef}
      />

      {game.mechanic === "slide" && (
        <div className="xws-tray">
          {game.tray != null ? (
            <>
              <span>last letter</span>
              <button
                className={`xws-traytile${trayReady ? " ready" : ""}`}
                onClick={onTray}
                disabled={!trayReady}
                aria-label={trayReady ? "Place the last letter" : "Slide the gap home to place the last letter"}
              >
                {game.tray}
              </button>
              <span>{trayReady ? "tap to drop it in" : "slide the gap home"}</span>
            </>
          ) : (
            <span>all letters placed</span>
          )}
        </div>
      )}

      <div className="xws-dock">
        <div className="xws-status">
          {solved ? (
            <span className="done">✓ Solved in {moves} moves</span>
          ) : (
            <span>{mode?.hint}</span>
          )}
        </div>

        <div className="xws-row">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`xws-btn${m.id === mechanic ? " on" : ""}`}
              onClick={() => !m.disabled && setMechanic(m.id)}
              disabled={m.disabled}
            >
              {m.label} · {m.note}
            </button>
          ))}
        </div>

        <div className="xws-row">
          <button className="xws-btn" onClick={undo} disabled={!history.length || solved}>Undo</button>
          <button className="xws-btn" onClick={shuffle}>Shuffle</button>
        </div>

        <div className="xws-row">
          <span className="xws-label">Clues</span>
          {CLUE_MODES.map((cm) => (
            <button
              key={cm.id}
              className={`xws-btn${cm.id === clueMode ? " on" : ""}`}
              onClick={() => setClueMode(cm.id)}
            >
              {cm.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
