import L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre finds its worker relative to its own file, which breaks once Next
// bundles it, so point it at the copy postinstall puts in public/.
setWorkerUrl('/maplibre-gl-worker.mjs');

const OFM =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface Basemap {
  name: string;
  /** OpenFreeMap vector style URL, or a raster tile template. */
  url: string;
  kind: 'vector' | 'raster';
  attribution: string;
  dark: boolean;
}

/** Free basemaps that need no API key. OpenFreeMap styles are vector (MapLibre GL). */
export const BASEMAPS: Basemap[] = [
  {
    name: 'Positron',
    url: 'https://tiles.openfreemap.org/styles/positron',
    kind: 'vector',
    attribution: OFM,
    dark: false
  },
  {
    name: 'Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
    kind: 'vector',
    attribution: OFM,
    dark: true
  },
  {
    name: 'Fiord',
    url: 'https://tiles.openfreemap.org/styles/fiord',
    kind: 'vector',
    attribution: OFM,
    dark: true
  },
  {
    name: 'Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    kind: 'vector',
    attribution: OFM,
    dark: false
  },
  {
    name: 'Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
    kind: 'vector',
    attribution: OFM,
    dark: false
  },
  {
    name: 'OSM Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    kind: 'raster',
    attribution: OSM,
    dark: false
  }
];

export function basemapLayer(b: Basemap): L.Layer {
  const attribution = `${b.attribution} · H3 by Uber`;
  if (b.kind === 'raster')
    return L.tileLayer(b.url, { attribution, maxZoom: 19 });
  // `attribution` is read by Leaflet's attribution control via layer options.
  return maplibreGL({
    style: b.url,
    attribution
  } as L.LeafletMaplibreGLOptions);
}

const KEY = 'mini-uber-basemap';

export function savedBasemap(): Basemap {
  try {
    const name = localStorage.getItem(KEY);
    return BASEMAPS.find((b) => b.name === name) ?? BASEMAPS[0];
  } catch {
    return BASEMAPS[0];
  }
}

export function saveBasemap(b: Basemap): void {
  try {
    localStorage.setItem(KEY, b.name);
  } catch {
    // storage unavailable; the default is fine
  }
}
