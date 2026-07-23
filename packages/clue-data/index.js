// Generated from mini-crosswords.md — the 10 hand-authored 5x5 minis (v1 schema).
// Each import is a full puzzle: { schemaVersion, id, title, author, size, minEntryLength, grid, clues }.
import m1 from "./minis/mini-001.json";
import m2 from "./minis/mini-002.json";
import m3 from "./minis/mini-003.json";
import m4 from "./minis/mini-004.json";
import m5 from "./minis/mini-005.json";
import m6 from "./minis/mini-006.json";
import m7 from "./minis/mini-007.json";
import m8 from "./minis/mini-008.json";
import m9 from "./minis/mini-009.json";
import m10 from "./minis/mini-010.json";

export const minis = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10];
export const minisById = Object.fromEntries(minis.map((m) => [m.id, m]));
