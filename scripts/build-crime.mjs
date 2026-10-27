// One-time build step: downloads a year of Omaha Police Department incident
// data (public CSV, no key) and counts cases per res-9 H3 cell and category.
//
//   node scripts/build-crime.mjs [--year 2025] [--file path/to/Incidents.csv]
//
// Writes src/lib/census/data/crime<year>.json. Run `yarn census` first: only
// incidents inside the census page's res-9 cells are kept.
//
// The CSV has one row per offense; a case (RB Number) with several offenses
// counts once overall and once in each category it touches. Locations are
// rounded by OPD to the block, which is plenty for res-9 cells (~0.1 km²).
import { readFileSync, writeFileSync } from "node:fs";
import { latLngToCell } from "h3-js";

const RES = 9;
const OUT_DIR = "src/lib/census/data";
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const YEAR = Number(arg("year") ?? 2025);
const URL = `https://police-static.cityofomaha.org/crime-data/${YEAR}/Incidents_${YEAR}.csv`;

// Order matters: the first matching category wins for a description.
// "No crime" calls are checked first so e.g. JUSTIFIABLE HOMICIDE isn't violent.
const CATEGORIES = [
  {
    id: "nonCriminal",
    match: /NO CRIME|NON CRIMINAL|JUSTIFIABLE|^SICKNESS|^INJURY|^OVERDOSE|^DEATH|SUICIDE ATTEMPT|ANIMAL BITE|MISSING PROPERTY/
  },
  {
    id: "violent",
    match: /HOMICIDE|MANSLAUGHTER|ASSAULT|ASLT|ROBBERY|KIDNAPPING|FALSE IMPRISONMENT|TRAFFICKING|CHILD ABUSE BY INTENT|INTIMIDATION|TERRORISTIC THREAT/
  },
  {
    id: "property",
    match: /THEFT|SHOPLIFTING|BURGLARY|UNLAWFUL ENTRY|DESTRUCTION OF PROPERTY|GRAFFITI|ARSON|FRAUD|FORGERY|EMBEZZLEMENT|BAD CHECK|STOLEN PROPERTY|UNLAWFULLY TAKEN|UNAUTHORIZED USE|FAIL TO RETURN|COMPUTER-UNAUTH/
  },
  {
    id: "other",
    match: /TRESPASS|CHILD ABUSE BY NEGLECT|PROTECTION ORDER|RESTRAINING ORDER|HARASSMENT|DISTURBING THE PEACE|INDECENT EXPOSURE|LITTER|INTRUDE|STALKING|TOW VEH|ABUSE INCOMPETENT|DELINQ|ENTICING|DEBAUCHING/
  }
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const NON_CRIMINAL = CATEGORY_IDS.indexOf("nonCriminal");

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const file = arg("file");
let text;
if (file) {
  console.log(`Reading ${file}…`);
  text = readFileSync(file, "utf8");
} else {
  console.log(`Fetching ${URL}…`);
  const res = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0 (mini-uber-h3-learning-project)" } });
  if (!res.ok) throw new Error(`OPD ${res.status}`);
  text = await res.text();
}

const [header, ...rows] = parseCsv(text);
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`Missing column "${name}"`);
  return i;
};
const RB = col("RB Number");
const DESC = col("Statute/Ordinance Description");
const LAT = col("Occurred Block LAT");
const LON = col("Occurred Block LON");

const { blockGroups } = JSON.parse(readFileSync(`${OUT_DIR}/blockGroups.json`, "utf8"));
const censusCells = new Set(blockGroups.flatMap((bg) => bg.cells));

// Gather each case: its location (first row with coordinates) and categories.
const cases = new Map();
const unmatched = new Map();
for (const r of rows) {
  const desc = (r[DESC] ?? "").trim().replace(/\s+/g, " ");
  let cat = CATEGORIES.findIndex((c) => c.match.test(desc));
  if (cat === -1) {
    unmatched.set(desc, (unmatched.get(desc) ?? 0) + 1);
    cat = CATEGORY_IDS.indexOf("other");
  }
  let c = cases.get(r[RB]);
  if (!c) cases.set(r[RB], (c = { cell: null, cats: new Set() }));
  c.cats.add(cat);
  const lat = parseFloat(r[LAT]);
  const lng = parseFloat(r[LON]);
  if (!c.cell && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
    c.cell = latLngToCell(lat, lng, RES);
  }
}

// counts[cell] = [...per category, all crimes (excl. non-criminal), all incl.]
const ALL = CATEGORY_IDS.length;
const ALL_INCL = ALL + 1;
const counts = {};
let noLocation = 0;
let outside = 0;
let kept = 0;
for (const c of cases.values()) {
  if (!c.cell) { noLocation++; continue; }
  if (!censusCells.has(c.cell)) { outside++; continue; }
  const v = (counts[c.cell] ??= new Array(ALL + 2).fill(0));
  for (const cat of c.cats) v[cat]++;
  if ([...c.cats].some((cat) => cat !== NON_CRIMINAL)) v[ALL]++;
  v[ALL_INCL]++;
  kept++;
}

if (unmatched.size > 0) {
  console.log("Unmatched descriptions (counted as other):");
  for (const [d, n] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${d}`);
}
const totals = new Array(ALL + 2).fill(0);
for (const v of Object.values(counts)) v.forEach((n, i) => (totals[i] += n));
console.log(`${rows.length} offense rows -> ${cases.size} cases; kept ${kept}, no location ${noLocation}, outside the census cells ${outside}`);
console.log("Totals:", Object.fromEntries([...CATEGORY_IDS, "all", "allInclNonCriminal"].map((id, i) => [id, totals[i]])));
if (totals[ALL_INCL] !== kept) throw new Error("Cell totals don't match kept cases");

writeFileSync(
  `${OUT_DIR}/crime${YEAR}.json`,
  JSON.stringify({
    source: `Omaha Police Department incident data, ${YEAR} (police.cityofomaha.org)`,
    year: YEAR,
    res: RES,
    // Column order of each cells[] entry.
    columns: [...CATEGORY_IDS, "all", "allInclNonCriminal"],
    totals,
    cells: counts
  })
);
console.log(`Wrote ${OUT_DIR}/crime${YEAR}.json (${Object.keys(counts).length} cells)`);
