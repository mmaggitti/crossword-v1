import { TOKENS } from "@crossword/core";

// The picker reuses the engine's design tokens (palette + scale, §11) rather
// than redefining any colour, so it can never drift from the player. Its own
// layout rules live under .xwp; the fullscreen flex column comes from .xw.
const PICKER_CSS = `
.xwp { overflow: hidden; }
.xwp-head {
  flex: 0 0 auto;
  padding: calc(var(--space-lg) + env(safe-area-inset-top, 0px)) var(--space-lg) var(--space-md);
}
.xwp-title {
  margin: 0;
  font-family: var(--mono); font-weight: 600; letter-spacing: .10em;
  text-transform: uppercase; color: var(--accent-deepest);
  font-size: var(--text-xl);
}
.xwp-sub {
  margin-top: var(--space-xs);
  font-family: var(--sans); font-size: var(--text-sm); color: var(--muted);
}
.xwp-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  list-style: none; margin: 0;
  padding: 0 var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: var(--space-sm);
}
.xwp-card {
  display: flex; align-items: center; gap: var(--space-md);
  width: 100%; font: inherit; text-align: left;
  padding: var(--space-md);
  background: var(--surface); color: var(--ink);
  border: var(--hairline) solid var(--border); border-radius: var(--radius);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.xwp-card:active { background: var(--accent-softest); border-color: var(--accent-soft); }
.xwp-thumb {
  flex: 0 0 auto; display: grid; gap: max(1px, calc(var(--u) * 0.03));
  width: calc(var(--u) * 2.6); height: calc(var(--u) * 2.6);
  padding: max(1px, calc(var(--u) * 0.03));
  background: var(--border); border-radius: calc(var(--radius) * 0.5);
}
.xwp-thumb i { background: var(--surface); border-radius: 1px; }
.xwp-thumb i.b { background: var(--accent-deepest); }
.xwp-meta { flex: 1 1 auto; min-width: 0; }
.xwp-num {
  font-family: var(--mono); font-size: var(--text-xs); letter-spacing: .08em;
  text-transform: uppercase; color: var(--muted);
}
.xwp-name {
  margin-top: 2px;
  font-family: var(--sans); font-size: var(--text-lg); font-weight: 600; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.xwp-go { flex: 0 0 auto; font-family: var(--mono); font-size: var(--text-lg); color: var(--accent-deep); }
`;

function Thumb({ puzzle }) {
  const { rows, cols } = puzzle.size;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = puzzle.grid[r] || "";
    for (let c = 0; c < cols; c++) {
      const ch = row[c] ?? ".";
      const block = ch === "." || ch === "#" || ch === " ";
      cells.push(<i key={`${r},${c}`} className={block ? "b" : ""} />);
    }
  }
  return (
    <div
      className="xwp-thumb"
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {cells}
    </div>
  );
}

export default function Picker({ minis, onPick }) {
  return (
    <div className="xw xwp">
      <style>{TOKENS}</style>
      <style>{PICKER_CSS}</style>
      <header className="xwp-head">
        <h1 className="xwp-title">Crossword</h1>
        <div className="xwp-sub">{minis.length} minis · tap to play</div>
      </header>
      <ul className="xwp-list">
        {minis.map((m, i) => (
          <li key={m.id}>
            <button className="xwp-card" onClick={() => onPick(m)}>
              <Thumb puzzle={m} />
              <div className="xwp-meta">
                <div className="xwp-num">Mini {String(i + 1).padStart(2, "0")}</div>
                <div className="xwp-name">{m.title}</div>
              </div>
              <span className="xwp-go" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
