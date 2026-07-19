/* Cache-first: once these five files are cached the app runs with no
   network at all. Bump CACHE on every deploy — a byte change in this file
   is what tells the browser a new version exists.

   Deliberately no skipWaiting() here. A new worker installs and waits; the
   page shows a banner and calls SKIP_WAITING when the user taps Reload, so
   code never swaps under a half-solved puzzle. */
var CACHE = "crossword-v4";
var ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;

  // Page loads are network-first, with cache:"reload" to step past the
  // host's own HTTP caching. A redeploy therefore lands on the next launch
  // with no cache-name bump and no second reload — which means iterating
  // only ever requires re-uploading index.html.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(new Request(e.request.url, { cache: "reload" })).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return resp;
      }).catch(function () {
        // Offline: serve the last good copy.
        return caches.match("./index.html");
      })
    );
    return;
  }

  // Everything else (icons, manifest) is cache-first — it rarely changes.
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
