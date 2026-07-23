import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// App is the hash router: it shows the picker, a bundled mini, a shared puzzle
// link, or the engine's sample. See App.jsx for the route table.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
