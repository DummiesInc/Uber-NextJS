import { H3_RES } from '@/lib/sim/config';
import { latLngToCell } from 'h3-js';

interface Spot {
  lat: number;
  lng: number;
  cell: string;
  updatedAt: number;
}

/**
 * "Fast memory" for driver locations, keyed by H3 cell.
 *
 * `latest` holds only each driver's most recent spot (every update overwrites
 * the last one), and `byCell` is the reverse index the dispatcher reads, so a
 * nearby-driver lookup touches only the cells around the rider instead of
 * scanning every driver on the map.
 */
export interface LocationIndex {
  readonly latest: Map<number, Spot>;
  readonly byCell: Map<string, Set<number>>;
  /** Record a driver's position; returns its res-8 cell. */
  update: (driverId: number, lat: number, lng: number) => string;
  remove: (driverId: number) => void;
  driversInCells: (cells: Iterable<string>) => number[];
  readonly occupiedCellCount: number;
}

export function createLocationIndex(): LocationIndex {
  const latest = new Map<number, Spot>();
  const byCell = new Map<string, Set<number>>();

  const removeFromCell = (cell: string, driverId: number): void => {
    const set = byCell.get(cell);
    if (!set) return;
    set.delete(driverId);
    if (set.size === 0) byCell.delete(cell);
  };

  return {
    latest,
    byCell,
    update(driverId, lat, lng) {
      const cell = latLngToCell(lat, lng, H3_RES);
      const prev = latest.get(driverId);
      if (prev && prev.cell !== cell) removeFromCell(prev.cell, driverId);
      if (!prev || prev.cell !== cell) {
        let set = byCell.get(cell);
        if (!set) byCell.set(cell, (set = new Set()));
        set.add(driverId);
      }
      latest.set(driverId, { lat, lng, cell, updatedAt: performance.now() });
      return cell;
    },
    remove(driverId) {
      const prev = latest.get(driverId);
      if (prev) removeFromCell(prev.cell, driverId);
      latest.delete(driverId);
    },
    driversInCells(cells) {
      const out: number[] = [];
      for (const c of cells) {
        const set = byCell.get(c);
        if (set) out.push(...set);
      }
      return out;
    },
    get occupiedCellCount() {
      return byCell.size;
    }
  };
}
