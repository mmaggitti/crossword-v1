import { useEffect, useState } from "react";
import { minis, minisById, minis3 } from "@crossword/clue-data";
import Game from "./Game.jsx";
import Picker from "./Picker.jsx";

// The URL hash is the router, matching the player's scheme:
//   #<mini-id>      a bundled mini  -> play it, with a way back to the list
//   #sample         the first mini  -> no picker chrome (dev + test harness)
//   (empty / other) nothing chosen  -> show the picker
function useHash() {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const route = hash.replace(/^#/, "");
  const toList = () => { window.location.hash = ""; };

  // Each mini is paired 1:1 with a 3x3 companion so the game can offer a size
  // toggle between the two versions of the same puzzle.
  const mini = minisById[route];
  if (mini) {
    const i = minis.indexOf(mini);
    return <Game key={route} puzzle={mini} puzzle3={minis3[i] ?? null} onExit={toList} />;
  }

  // A stable entry point for the test harness — no back button.
  if (route === "sample") return <Game key="sample" puzzle={minis[0]} puzzle3={minis3[0] ?? null} />;

  return <Picker minis={minis} onPick={(m) => { window.location.hash = m.id; }} />;
}
