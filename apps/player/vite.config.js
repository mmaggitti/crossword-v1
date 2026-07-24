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
        // Precache the player's immutable, hash-named assets (fast loads + full
        // offline), but NOT any HTML — HTML is served network-first below, so a
        // new deploy shows up immediately in installed apps instead of being
        // pinned by a cached document. cleanupOutdatedCaches drops old precaches.
        globPatterns: ["**/*.{js,css,png,svg,webmanifest}"],
        cleanupOutdatedCaches: true,
        // Disable VitePWA's default SPA fallback (it would register a
        // NavigationRoute serving a precached index.html, which both intercepts
        // navigations before the network-first rule below and no longer exists
        // in the precache). null turns it off.
        navigateFallback: null,
        // This SW's scope (/crossword-v1/) covers three
        // separate apps — the player, /scramble/, and /dev/ — so there is no one
        // shell to fall back to. Each document is fetched network-first per URL
        // (rule 1), which is also what keeps installed apps from going stale.
        runtimeCaching: [
          {
            // Network-first HTML across the whole scope (player, /scramble/,
            // /dev/): always fetch the latest document online, fall back to the
            // last cached copy offline. This is the anti-stale rule.
            urlPattern: ({ request, url }) =>
              url.pathname.startsWith("/crossword-v1/") &&
              (request.mode === "navigate" || request.destination === "document"),
            handler: "NetworkFirst",
            options: {
              cacheName: "crossword-v1-html",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 32 }
            }
          },
          {
            // The sibling apps (/scramble/, /dev/) are assembled in after the
            // player build, so they are never in this precache. Serve their
            // assets network-first too, so their latest hashed bundles load
            // without a manual cache clear (cached copies cover offline).
            urlPattern: ({ url }) => /^\/crossword-v1\/(scramble|dev)\//.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "crossword-v1-siblings",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 128 }
            }
          }
        ]
      }
    })
  ]
});
