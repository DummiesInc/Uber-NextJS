import {
  cellToLatLng,
  gridPathCells,
  latLngToCell,
  polygonToCells
} from 'h3-js';
import { H3_RES, SERVICE_AREA } from '@/lib/sim/config';
import type { LatLng } from '@/lib/sim/types';

/** Every res-8 cell inside the service area, computed once. */
export const SERVICE_CELLS: string[] = polygonToCells(
  SERVICE_AREA.map((p) => [p.lat, p.lng]),
  H3_RES
);
export const SERVICE_SET = new Set(SERVICE_CELLS);

export const toCell = (p: LatLng) => latLngToCell(p.lat, p.lng, H3_RES);

export function cellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

/** Cell-to-cell path as a polyline through cell centers. */
export function hexPath(from: string, to: string): LatLng[] {
  try {
    return gridPathCells(from, to).map(cellCenter);
  } catch {
    return [cellCenter(from), cellCenter(to)];
  }
}

/** The ordered, de-duplicated cells a polyline passes through. */
export function polylineToCells(points: LatLng[]): string[] {
  const cells: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = toCell(points[i]);
    if (cells[cells.length - 1] !== a) {
      if (cells.length > 0) {
        // Fill gaps when consecutive vertices skip over cells.
        for (const c of hexPath(cells[cells.length - 1], a)
          .map(toCell)
          .slice(1)) {
          if (cells[cells.length - 1] !== c) cells.push(c);
        }
      } else {
        cells.push(a);
      }
    }
  }
  return [...new Set(cells)];
}
