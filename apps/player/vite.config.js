import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Root-hosted by default. Deployed under the monorepo Pages site with:
  //     BASE_PATH=/crossword/ npm run build --workspace player
  base: process.env.BASE_PATH ?? "/",

  // Resolve @crossword/core to its SOURCE, so plugin-react transforms it as
  // first-party code (JSX shipped inside a node_modules package would not be).
  resolve: {
    alias: {
      "@crossword/core": resolve(here, "../../packages/core/src/index.js"),
      "@crossword/clue-data": resolve(here, "../../packages/clue-data/index.js"),
    },
  },
  optimizeDeps: { exclude: ["@crossword/core", "@crossword/clue-data"] },

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon-32.png"],
      manifest: {
        name: "Crossword Player",
        short_name: "Crossword",
        description: "Play crosswords. Works offline.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        // Matches --canvas, so the status bar blends into the app field.
        background_color: "#FBF9F4",
        theme_color: "#FBF9F4",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // The app is fully static, so precaching everything makes it work
        // offline from the first visit onward.
        cleanupOutdatedCaches: true
      }
    })
  ]
});
