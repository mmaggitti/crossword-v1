import { useEffect, useMemo, useState } from "react";
import { parsePuzzle, TOKENS } from "@crossword/core";
import Board, { SCRAMBLE_CSS } from "./Board.jsx";
import {
  applyMove,
  isSolved,
  legalMoves,
  scrambleUnsolved,
} from "./mechanics.js";

// Each mechanic is a self-contained mode, and together they read as a
// difficulty ladder. Switching re-scrambles rather than converting the board,
// because a puzzle is only guaranteed solvable by the mechanic that shuffled it.
const MODES = [
  { id: "swap", label: "Swap", note: "easy", hint: "tap two tiles" },
  { id: "slide", label: "Slide", note: "med", hint: "tap a tile by the gap" },
  // Cyclic needs blockless grids to be well-defined — a row chopped by black
  // squares has no meaningful "shift and wrap". It arrives with word squares.
  { id: "cyclic", label: "Cyclic", note: "soon", hint: "", disabled: true },
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

export default function Game({ puzzle, onExit }) {
  const model = useMemo(() => parsePuzzle(puzzle), [puzzle]);
  const [mechanic, setMechanic] = useState("swap");
  const [clueMode, setClueMode] = useState("none");
  const [game, setGame] = useState(null);
  const [history, setHistory] = useState([]);
  const [moves, setMoves] = useState(0);
  const [sel, setSel] = useState(null);

  // (Re)start whenever the puzzle or the mechanic changes.
  useEffect(() => {
    setGame(scrambleUnsolved(model.solution, mechanic).state);
    setHistory([]);
    setMoves(0);
    setSel(null);
  }, [model, mechanic]);

  const solved = game ? isSolved(game, model.solution) : false;

  // Slide: highlight the tiles that can actually move into the gap.
  const movable = useMemo(() => {
    if (!game || game.mechanic !== "slide" || solved) return null;
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
    const all = model.entries.map((e) => e.clue);
    return all
      .map((clue) => ({ clue, k: hash(`${puzzle.id}:${clue}`) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.clue);
  }, [model, puzzle.id]);

  const mode = MODES.find((m) => m.id === mechanic);

  if (!game) return null;

  return (
    <div className="xw xws">
      <style>{TOKENS}</style>
      <style>{SCRAMBLE_CSS}</style>

      <header className="xws-head">
        {onExit && (
          <button className="xws-back" onClick={onExit}>‹ Puzzles</button>
        )}
        <h1 className="xws-title">{model.title}</h1>
        <span className="xws-mode">{model.cols}×{model.rows}</span>
      </header>

      <Board
        model={model}
        state={game}
        sel={sel}
        movable={movable}
        onCell={onCell}
        solved={solved}
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

      {clueMode !== "none" && (
        <div className="xws-clues">
          {clueMode === "jumbled" ? (
            <div className="xws-pool">
              {jumbled.map((clue, i) => (
                <span className="xws-chip" key={i}>{clue}</span>
              ))}
            </div>
          ) : (
            <div className="xws-cols">
              <div>
                {model.entries.filter((e) => e.dir === "across").map((e) => (
                  <div key={e.id}><b>{e.number}A</b> {e.clue}</div>
                ))}
              </div>
              <div>
                {model.entries.filter((e) => e.dir === "down").map((e) => (
                  <div key={e.id}><b>{e.number}D</b> {e.clue}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="xws-dock">
        <div className="xws-status">
          {solved ? (
            <span className="done">✓ Solved in {moves} moves</span>
          ) : (
            <>
              <span>Moves: {moves}</span>
              <span>{mode?.hint}</span>
            </>
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
