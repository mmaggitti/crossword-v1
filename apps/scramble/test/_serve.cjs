// Minimal dependency-free static file server for the Playwright suite.
//
// The Vite build ships ES-module <script> tags, which browsers refuse to load
// from a file:// origin, so the built dist/ must be served over HTTP.
//
//   const { serve } = require("./_serve.cjs");
//   const site = await serve(DIST);   // { url, close }
//   await page.goto(site.url);
//   ...
//   await site.close();
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serve(dir) {
  const root = path.resolve(dir);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel.endsWith("/")) rel += "index.html";
      const fp = path.join(root, path.normalize(rel));
      if (fp !== root && !fp.startsWith(root + path.sep)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      fs.readFile(fp, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", MIME[path.extname(fp)] || "application/octet-stream");
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { serve };
