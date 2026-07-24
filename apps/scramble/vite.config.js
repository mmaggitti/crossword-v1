import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Root-hosted by default. Deployed under the monorepo Pages site with:
  //     BASE_PATH=/crossword-v1/scramble/ npm run build --workspace scramble
  base: process.env.BASE_PATH ?? "/",

  // Same as the player: resolve the workspace packages to their SOURCE, so
  // plugin-react transforms their JSX as first-party code (JSX shipped inside
  // a node_modules package would not be).
  resolve: {
    alias: {
      "@crossword/core": resolve(here, "../../packages/core/src/index.js"),
      "@crossword/clue-data": resolve(here, "../../packages/clue-data/index.js"),
    },
  },
  optimizeDeps: { exclude: ["@crossword/core", "@crossword/clue-data"] },

  // Deliberately NO vite-plugin-pwa here. The player already registers a
  // service worker at /crossword-v1/ whose scope covers this path; a second,
  // nested worker would mean two caches racing over one origin. The player's
  // navigateFallbackDenylist already lets /scramble/ through to the network.
  plugins: [react()],
});
