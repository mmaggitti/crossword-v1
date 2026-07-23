const { webkit } = require("playwright");
const { serve } = require("./_serve.cjs");
const DIST = require("path").resolve(__dirname, "../dist");

const rl = (hex) => {
  const c = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
    .map(v => v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
};
const contrast = (a,b) => {
  const [x,y] = [rl(a), rl(b)].sort((m,n)=>n-m);
  return (x+0.05)/(y+0.05);
};

(async () => {
  const b = await webkit.launch();
  const site = await serve(DIST);
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  await p.goto(site.url + "#sample");
  await p.waitForSelector(".xw-gridwrap");

  const read = () => p.evaluate(() => {
    const bar = document.querySelector(".xw-cluebar").getBoundingClientRect();
    const pill = document.querySelector(".xw-cluetext");
    const cs = getComputedStyle(pill);
    return {
      barH: +bar.height.toFixed(1),
      gridH: +document.querySelector(".xw-gridwrap").getBoundingClientRect().height.toFixed(1),
      bg: cs.backgroundColor, fg: cs.color,
      size: cs.fontSize, weight: cs.fontWeight, radius: cs.borderTopLeftRadius,
      text: pill.textContent,
    };
  });

  const a = await read();
  console.log(`clue "${a.text}"  bar ${a.barH}  grid ${a.gridH}`);
  console.log(`  pill  bg ${a.bg}  fg ${a.fg}  ${a.size}/${a.weight}  radius ${a.radius}`);

  // step through every clue: bar height and grid height must never move
  const heights = new Set([a.barH]), grids = new Set([a.gridH]);
  for (let i = 0; i < 9; i++) {
    await p.click(".xw-arrow:last-of-type");
    const r = await read();
    heights.add(r.barH); grids.add(r.gridH);
  }
  console.log("distinct bar heights across all clues:", [...heights].join(", "));
  console.log("distinct grid heights across all clues:", [...grids].join(", "));

  // and an artificially long clue
  await p.evaluate(() => {
    document.querySelector(".xw-cluetext").textContent =
      "A deliberately overlong clue written to see whether the pill can push the board around when it wraps onto more lines than expected";
  });
  const long = await read();
  console.log("with an overlong clue -> bar", long.barH, "grid", long.gridH);

  console.log("contrast accent on accent-softest:", contrast("#076B3B", "#CDE8D4").toFixed(2) + ":1",
              "(AA normal text needs 4.5)");

  const checks = [
    ["clue bar height constant across clues", heights.size === 1],
    ["grid height constant across clues", grids.size === 1],
    ["overlong clue doesn't resize bar or grid", long.barH === a.barH && long.gridH === a.gridH],
    ["pill contrast meets AA (>=4.5)", contrast("#076B3B", "#CDE8D4") >= 4.5],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  bad.forEach(([n]) => console.log("FAIL - " + n));
  console.log(bad.length ? `\n${bad.length} clue-bar checks failed.` : "\nClue bar never resizes the board.");
  await b.close();
  await site.close();
  process.exit(bad.length ? 1 : 0);
})();
