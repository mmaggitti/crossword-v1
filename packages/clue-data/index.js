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

// The 3x3 companion set (see gen-minis3.mjs) — a smaller, easier version, one
// per 5x5 mini by index so an app can offer a size toggle between the two.
import t1 from "./minis3/mini3-001.json";
import t2 from "./minis3/mini3-002.json";
import t3 from "./minis3/mini3-003.json";
import t4 from "./minis3/mini3-004.json";
import t5 from "./minis3/mini3-005.json";
import t6 from "./minis3/mini3-006.json";
import t7 from "./minis3/mini3-007.json";
import t8 from "./minis3/mini3-008.json";
import t9 from "./minis3/mini3-009.json";
import t10 from "./minis3/mini3-010.json";

export const minis = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10];
export const minisById = Object.fromEntries(minis.map((m) => [m.id, m]));

export const minis3 = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10];
export const minis3ById = Object.fromEntries(minis3.map((m) => [m.id, m]));
