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
export class LocationIndex {
  readonly latest = new Map<number, Spot>();
  readonly byCell = new Map<string, Set<number>>();

  update(driverId: number, lat: number, lng: number): string {
    const cell = latLngToCell(lat, lng, H3_RES);
    const prev = this.latest.get(driverId);
    if (prev && prev.cell !== cell) this.removeFromCell(prev.cell, driverId);
    if (!prev || prev.cell !== cell) {
      let set = this.byCell.get(cell);
      if (!set) this.byCell.set(cell, (set = new Set()));
      set.add(driverId);
    }
    this.latest.set(driverId, { lat, lng, cell, updatedAt: performance.now() });
    return cell;
  }

  remove(driverId: number): void {
    const prev = this.latest.get(driverId);
    if (prev) this.removeFromCell(prev.cell, driverId);
    this.latest.delete(driverId);
  }

  driversInCells(cells: Iterable<string>): number[] {
    const out: number[] = [];
    for (const c of cells) {
      const set = this.byCell.get(c);
      if (set) out.push(...set);
    }
    return out;
  }

  get occupiedCellCount(): number {
    return this.byCell.size;
  }

  private removeFromCell(cell: string, driverId: number): void {
    const set = this.byCell.get(cell);
    if (!set) return;
    set.delete(driverId);
    if (set.size === 0) this.byCell.delete(cell);
  }
}
