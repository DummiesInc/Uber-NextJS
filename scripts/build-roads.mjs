// One-time build step: downloads Omaha's main road network from OpenStreetMap
// (Overpass API) and writes a compact routing graph to src/lib/sim/data/roads.json.
//
//   node scripts/build-roads.mjs
//
// The graph keeps only junctions/dead-ends as nodes; the road shape between
// two junctions is stored on the edge, so the file stays small.
import { writeFileSync } from "node:fs";

const BBOX = [41.2, -96.2, 41.345, -95.875]; // south, west, north, east (matches SERVICE_AREA)
const CLASSES = [
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
];
// Typical speeds (m/s) used to turn distance into drive time.
const SPEED = {
  motorway: 27, motorway_link: 15, trunk: 22, trunk_link: 13, primary: 16, primary_link: 12,
  secondary: 14, secondary_link: 11, tertiary: 12, tertiary_link: 10, unclassified: 10,
};

const query = `[out:json][timeout:180];
way["highway"~"^(${CLASSES.join("|")})$"](${BBOX.join(",")});
out geom;`;

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function fetchOverpass() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    console.log(`Fetching roads from ${new URL(url).host}…`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "mini-uber-h3-learning-project" },
        body: "data=" + encodeURIComponent(query),
      });
      if (res.ok) return res;
      console.log(`  ${res.status}, retrying`);
    } catch (err) {
      console.log(`  ${err.message}, retrying`);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** Math.floor(attempt / MIRRORS.length)));
  }
  throw new Error("All Overpass mirrors failed");
}

const res = await fetchOverpass();
const { elements } = await res.json();
const ways = elements.filter((e) => e.type === "way" && e.geometry?.length >= 2);
console.log(`${ways.length} ways`);

// Count how many ways touch each OSM node; junctions are where >1 way meets or a way ends.
const uses = new Map();
for (const w of ways) {
  w.nodes.forEach((id, i) => {
    const endBonus = i === 0 || i === w.nodes.length - 1 ? 1 : 0;
    uses.set(id, (uses.get(id) ?? 0) + 1 + endBonus);
  });
}

const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const r5 = (x) => Math.round(x * 1e5) / 1e5;

const nodeIndex = new Map(); // OSM id -> compact index
const nodes = [];
const idx = (id, p) => {
  if (!nodeIndex.has(id)) {
    nodeIndex.set(id, nodes.length);
    nodes.push([r5(p.lat), r5(p.lon)]);
  }
  return nodeIndex.get(id);
};

let edges = [];
for (const w of ways) {
  const speed = SPEED[w.tags.highway] ?? 10;
  let start = 0, len = 0, shape = [];
  for (let i = 1; i < w.nodes.length; i++) {
    len += dist(w.geometry[i - 1], w.geometry[i]);
    const isJunction = i === w.nodes.length - 1 || uses.get(w.nodes[i]) > 1;
    if (!isJunction) {
      shape.push(r5(w.geometry[i].lat), r5(w.geometry[i].lon));
      continue;
    }
    const a = idx(w.nodes[start], w.geometry[start]);
    const b = idx(w.nodes[i], w.geometry[i]);
    if (a !== b) edges.push([a, b, Math.round(len), speed, shape]);
    start = i; len = 0; shape = [];
  }
}

// Keep only the largest connected component so every route can be found.
const adj = nodes.map(() => []);
edges.forEach(([a, b], i) => { adj[a].push(i); adj[b].push(i); });
const comp = new Int32Array(nodes.length).fill(-1);
let best = -1, bestSize = 0;
for (let s = 0, c = 0; s < nodes.length; s++) {
  if (comp[s] !== -1) continue;
  const stack = [s]; comp[s] = c; let size = 0;
  while (stack.length) {
    const n = stack.pop(); size++;
    for (const ei of adj[n]) {
      const [a, b] = edges[ei]; const m = a === n ? b : a;
      if (comp[m] === -1) { comp[m] = c; stack.push(m); }
    }
  }
  if (size > bestSize) { bestSize = size; best = c; }
  c++;
}
const remap = new Int32Array(nodes.length).fill(-1);
const keptNodes = [];
nodes.forEach((p, i) => { if (comp[i] === best) { remap[i] = keptNodes.length; keptNodes.push(p); } });
edges = edges.filter(([a]) => comp[a] === best).map(([a, b, l, s, g]) => [remap[a], remap[b], l, s, g]);

writeFileSync("src/lib/sim/data/roads.json", JSON.stringify({ nodes: keptNodes, edges }));
console.log(`Wrote ${keptNodes.length} nodes, ${edges.length} edges (largest component of ${nodes.length} nodes)`);
