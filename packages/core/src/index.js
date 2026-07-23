// Public surface of the shared crossword engine.
//
//   parsePuzzle(json) -> pure geometry (solution, entries, cellIndex, ...)  [no DOM]
//   CrosswordPlayer   -> the default DOM renderer / full player component
//   share codec       -> puzzle <-> URL-hash (#p=...) encode/decode
//
// usePuzzle and GridDOM stay module-private until a second consumer (e.g. a
// ClueBattle constructor) needs them; export them here when that happens.
export { default, parsePuzzle, TOKENS } from "./CrosswordPlayer.jsx";
export * from "./share.js";
