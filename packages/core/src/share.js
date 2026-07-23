/* ============================================================================
   share.js — puzzle <-> URL

   A puzzle is small enough to travel inside its own link. Encoding it into
   the hash fragment means sharing needs no server, no database, and no
   deploy: you paste a URL and the recipient has the puzzle.

   The hash fragment (not the query string) is deliberate — it never leaves
   the browser, so puzzle contents never appear in a host's access logs.

   Size: a 5x5 mini encodes to roughly 600 characters, comfortably inside
   every practical URL limit. A full 15x15 with 78 clues lands near 5 KB,
   which is past what messaging apps and some proxies handle cleanly. If you
   go that big, add a deflate step — see README "Scaling the share link".
   ========================================================================== */

const PREFIX = "#p=";

/* base64url: standard base64 with the URL-hostile characters swapped and
   padding dropped, so the result survives being pasted anywhere. */

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodePuzzle(puzzle) {
  const json = JSON.stringify(puzzle);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodePuzzle(encoded) {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json);
}

/** Read a puzzle out of the current URL. Returns null if there isn't one. */
export function puzzleFromLocation(loc = window.location) {
  const h = loc.hash || "";
  if (!h.startsWith(PREFIX)) return null;
  try {
    return decodePuzzle(h.slice(PREFIX.length));
  } catch {
    return null; // malformed link — fall through to the bundled samples
  }
}

/** Build a shareable absolute URL for a puzzle. */
export function shareUrl(puzzle, loc = window.location) {
  return `${loc.origin}${loc.pathname}${PREFIX}${encodePuzzle(puzzle)}`;
}

/** Copy to clipboard, with a fallback for non-secure contexts. */
export async function copyShareUrl(puzzle) {
  const url = shareUrl(puzzle);
  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, url };
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return { ok, url };
  }
}
