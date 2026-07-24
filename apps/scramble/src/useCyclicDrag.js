import { useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { useSpring } from "@react-spring/web";

/* The grab-and-drag carousel for cyclic mode.
 *
 * `@use-gesture` captures the drag, locks to the dominant axis, and reports the
 * movement + release velocity; `@react-spring` drives the live `offset` (px
 * along the line) and springs it to the nearest whole-cell step on release,
 * carrying velocity for a little momentum. The Board renders the drag from
 * `active` + `offset` — a rigid 3-copy strip when the empties travel (Unlocked),
 * or a per-tile ring carousel when they're Locked; this hook owns the physics
 * and surfaces `pitch` (px per cell) so the Board can turn `offset` into a phase.
 *
 * onShift(axis, index, steps): apply `steps` discrete shifts to the board
 *   (steps < 0 means the opposite direction).
 *
 * The grid rect is measured once per drag (interaction math, not layout) to turn
 * pixels into cell steps.
 */
export function useCyclicDrag({ gridRef, rows, cols, enabled, onShift }) {
  const [active, setActive] = useState(null);      // { axis:"row"|"col", index, pitch }
  const [{ offset }, api] = useSpring(() => ({ offset: 0 }), []);
  const lock = useRef(null);                        // { axis, index, pitch }

  const bind = useDrag(
    ({ first, last, movement: [mx, my], velocity: [vx, vy], xy: [px, py], cancel }) => {
      if (!enabled) { cancel?.(); return; }

      // Lock the axis + line from the first significant movement (the drag only
      // fires past `threshold`, so mx/my already point the dominant way).
      if (first || !lock.current) {
        const rect = gridRef.current?.getBoundingClientRect();
        if (!rect) return;
        const axis = Math.abs(mx) >= Math.abs(my) ? "row" : "col";
        const relX = px - rect.left, relY = py - rect.top;
        const index = axis === "row"
          ? Math.max(0, Math.min(rows - 1, Math.floor((relY / rect.height) * rows)))
          : Math.max(0, Math.min(cols - 1, Math.floor((relX / rect.width) * cols)));
        const pitch = axis === "row" ? rect.width / cols : rect.height / rows;
        lock.current = { axis, index, pitch };
        // Reset the offset HERE, before the overlay mounts — the clean baseline for
        // this drag. Never reset it in onRest: snapping the still-mounted (pre-shift)
        // strip back to 0 would flash the line to its start position for a frame
        // before React commits the shift. See the onRest note below.
        api.set({ offset: 0 });
        setActive({ axis, index, pitch });
      }

      const L = lock.current;
      const along = L.axis === "col" ? my : mx;

      if (last) {
        const v = L.axis === "col" ? vy : vx;
        const raw = along / L.pitch;
        // Round to the nearest step, plus up to ~1.5 cells of fling momentum.
        const steps = Math.round(raw + Math.sign(raw || v) * Math.min(1.5, Math.abs(v) * 0.8));
        api.start({
          offset: steps * L.pitch,
          config: { tension: 320, friction: 30 },
          onRest: () => {
            // Commit the shift and drop the overlay in one React-18 batched commit.
            // The strip is holding at steps*pitch — pixel-identical to the shifted
            // grid about to paint — so it unmounts straight onto a matching board.
            // Do NOT api.set({ offset: 0 }) here: that imperative write repaints the
            // old strip at its start position before the commit lands (the glitch).
            if (steps) onShift(L.axis, L.index, steps);
            lock.current = null;
            setActive(null);
          },
        });
      } else {
        api.set({ offset: along });
      }
    },
    // Pointer events (the default) unify mouse + touch + pen — works in the
    // pane, in Playwright, and on iOS. `threshold` defers the drag until a real
    // move, so taps still fall through as clicks.
    { axis: undefined, filterTaps: true, threshold: 6 }
  );

  return { bind, active, offset };
}
