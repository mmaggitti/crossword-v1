import { useEffect, useState } from "react";
import CrosswordPlayer from "@crossword/core";
import { minis, minisById } from "@crossword/clue-data";
import Picker from "./Picker.jsx";

// The URL hash is the router:
//   #p=<base64url>   a shared puzzle link  -> hand to the player, which decodes it
//   #<mini-id>       a bundled mini        -> load it, with a way back to the list
//   #sample          the engine's built-in sample (dev shortcut + test harness)
//   (empty / other)  nothing chosen        -> show the picker
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

  // A shared puzzle: let the player read and decode the hash itself. Keyed on
  // the hash so switching between two shared links remounts cleanly.
  if (route.startsWith("p=")) return <CrosswordPlayer key={hash} />;

  // A bundled mini, chosen from the picker or deep-linked. onExit returns here.
  const mini = minisById[route];
  if (mini) return <CrosswordPlayer key={route} puzzle={mini} onExit={toList} />;

  // The engine's built-in sample — no picker chrome, no back button.
  if (route === "sample") return <CrosswordPlayer key="sample" />;

  return <Picker minis={minis} onPick={(m) => { window.location.hash = m.id; }} />;
}
