import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// App is the hash router: it shows the picker, a bundled mini, or the sample.
// See App.jsx for the route table.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
