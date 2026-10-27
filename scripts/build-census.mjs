// One-time build step: downloads 2020 Census block groups for the Omaha area
// from the Census Bureau's TIGERweb map service (no API key needed) and maps
// each block group onto res-9 H3 cells.
//
//   node scripts/build-census.mjs
//
// Writes:
//   src/lib/census/data/blockGroups.json  – per block group: GEOID, 2020
//     population (POP100), housing units (HU100) and the res-9 cells it covers
//   src/lib/census/data/blockGroupShapes.json – simplified outlines (GeoJSON)
//
// Mapping: a res-9 cell belongs to the block group its centre falls in, and a
// block group's count is later split evenly over its cells. A block group too
// small to contain any cell centre gets the cell at its interior point.
import { mkdirSync, writeFileSync } from "node:fs";
import { latLngToCell, polygonToCells } from "h3-js";

const BBOX = [-96.2, 41.2, -95.875, 41.345]; // west, south, east, north (matches SERVICE_AREA)
const RES = 9;
const OUT_DIR = "src/lib/census/data";
const LAYER =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/8/query";

const params = new URLSearchParams({
  where: "1=1",
  geometry: BBOX.join(","),
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
  outFields: "GEOID,STATE,COUNTY,TRACT,BLKGRP,POP100,HU100,INTPTLAT,INTPTLON",
  returnGeometry: "true",
  outSR: "4326",
  // ~5 m generalisation and 5 decimals keep the outline file small; at res 9
  // (cell centres ~170 m apart) it doesn't change which cells a group gets.
  maxAllowableOffset: "0.00005",
  geometryPrecision: "5",
  f: "geojson"
});

console.log("Fetching 2020 block groups from TIGERweb…");
const res = await fetch(`${LAYER}?${params}`, {
  headers: { "User-Agent": "mini-uber-h3-learning-project" }
});
if (!res.ok) throw new Error(`TIGERweb ${res.status}`);
const { features, exceededTransferLimit } = await res.json();
if (exceededTransferLimit) throw new Error("TIGERweb truncated the result; page the query");
console.log(`${features.length} block groups`);

/** Every polygon ring set of a Polygon or MultiPolygon, in GeoJSON [lng, lat]. */
const polygonsOf = (geometry) =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

const owner = new Map(); // cell -> GEOID, so no cell is counted twice
const blockGroups = [];
let placedByPoint = 0;
for (const f of features) {
  const p = f.properties;
  const cells = [];
  for (const polygon of polygonsOf(f.geometry)) {
    for (const cell of polygonToCells(polygon, RES, true)) {
      if (owner.has(cell)) continue;
      owner.set(cell, p.GEOID);
      cells.push(cell);
    }
  }
  if (cells.length === 0) {
    cells.push(latLngToCell(Number(p.INTPTLAT), Number(p.INTPTLON), RES));
    placedByPoint++;
  }
  blockGroups.push({
    geoid: p.GEOID,
    county: `${p.STATE}${p.COUNTY}`,
    population: p.POP100,
    housingUnits: p.HU100,
    cells
  });
}
blockGroups.sort((a, b) => a.geoid.localeCompare(b.geoid));

const population = blockGroups.reduce((sum, bg) => sum + bg.population, 0);
const cellCount = new Set(blockGroups.flatMap((bg) => bg.cells)).size;
console.log(`${population} people over ${cellCount} res-9 cells; ${placedByPoint} small groups placed by interior point`);

const shapes = {
  type: "FeatureCollection",
  features: features.map((f) => ({
    type: "Feature",
    properties: { geoid: f.properties.GEOID },
    geometry: f.geometry
  }))
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  `${OUT_DIR}/blockGroups.json`,
  JSON.stringify({
    source: "U.S. Census Bureau, 2020 Census (TIGERweb tigerWMS_Census2020, POP100/HU100)",
    res: RES,
    blockGroups
  })
);
writeFileSync(`${OUT_DIR}/blockGroupShapes.json`, JSON.stringify(shapes));
console.log(`Wrote ${OUT_DIR}/blockGroups.json and blockGroupShapes.json`);
