import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// One codebase, two themed builds: the same player ships green at
// /crossword-v1/ and purple at /crossword-v1/purple/. BASE_URL is derived from
// the build's `base`, so the deployed build self-identifies and the theme can
// never drift from the URL it is served at; VITE_THEME is the local-dev
// override (npm run dev:purple). The class goes on <html> so both the player
// and the picker pick it up — see the .theme-purple block in TOKENS.
if (
  import.meta.env.BASE_URL.includes("/purple/") ||
  import.meta.env.VITE_THEME === "purple"
) {
  document.documentElement.classList.add("theme-purple");
}

// App is the hash router: it shows the picker, a bundled mini, a shared puzzle
// link, or the engine's sample. See App.jsx for the route table.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
