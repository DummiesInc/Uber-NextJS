import {
  cellToLatLng,
  gridDisk,
  gridDistance,
  latLngToCell,
  polygonToCells
} from 'h3-js';
import { SERVICE_AREA } from '@/lib/sim/config';
import { LOCATIONS } from '@/lib/sim/data/locations';
import type { LatLng } from '@/lib/sim/types';

/** Demand is tracked one resolution finer than dispatch (~0.1 km² per cell). */
export const HEAT_RES = 9;

/** Every res-9 cell inside the service area, computed once. */
export const HEAT_CELLS: string[] = polygonToCells(
  SERVICE_AREA.map((p) => [p.lat, p.lng]),
  HEAT_RES
);
const HEAT_SET = new Set(HEAT_CELLS);

export const toHeatCell = (p: LatLng) => latLngToCell(p.lat, p.lng, HEAT_RES);

/** Cells whose value changed, or null when the whole map was replaced. */
type HeatListener = (changed: string[] | null) => void;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * Rider demand per res-9 cell, 0 (none) to 1 (hottest). Only non-zero cells
 * are stored. Idle drivers read it to decide where to roam.
 */
export class HeatMap {
  private values = new Map<string, number>();
  private listeners = new Set<HeatListener>();

  get(cell: string): number {
    return this.values.get(cell) ?? 0;
  }

  at(p: LatLng): number {
    return this.get(toHeatCell(p));
  }

  entries(): [string, number][] {
    return [...this.values];
  }

  get size(): number {
    return this.values.size;
  }

  onChange(fn: HeatListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Scatter 8–14 hot spots of different sizes over the city, half of them on
   * real pickup spots, on top of a faint background, so demand never pools in
   * one place.
   */
  randomize(): void {
    this.values.clear();
    for (const cell of HEAT_CELLS) {
      if (Math.random() < 0.35) this.values.set(cell, rand(0.03, 0.12));
    }
    const spots = Math.round(rand(8, 14));
    for (let i = 0; i < spots; i++) {
      const center =
        Math.random() < 0.5
          ? toHeatCell(LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)])
          : HEAT_CELLS[Math.floor(Math.random() * HEAT_CELLS.length)];
      this.blob(center, Math.round(rand(2, 6)), rand(0.45, 1));
    }
    this.emit(null);
  }

  /** Raise (or with `erase`, lower) demand around `p`, fading out over `rings`. */
  paint(p: LatLng, rings: number, strength: number, erase = false): void {
    const center = toHeatCell(p);
    const changed: string[] = [];
    for (const cell of gridDisk(center, rings)) {
      if (!HEAT_SET.has(cell)) continue;
      const falloff = 1 - gridDistance(center, cell) / (rings + 1);
      const delta = strength * falloff * (erase ? -1 : 1);
      this.set(cell, this.get(cell) + delta);
      changed.push(cell);
    }
    if (changed.length > 0) this.emit(changed);
  }

  clear(): void {
    this.values.clear();
    this.emit(null);
  }

  /** Plain object form, for saving a painted map. */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  load(saved: Record<string, number>): void {
    this.values.clear();
    for (const [cell, v] of Object.entries(saved)) {
      if (HEAT_SET.has(cell) && typeof v === 'number') this.set(cell, v);
    }
    this.emit(null);
  }

  /** A soft round hot spot; overlapping spots keep the higher value. */
  private blob(center: string, rings: number, peak: number): void {
    for (const cell of gridDisk(center, rings)) {
      if (!HEAT_SET.has(cell)) continue;
      const d = gridDistance(center, cell) / rings;
      const v = peak * Math.exp(-2.5 * d * d);
      if (v > this.get(cell)) this.set(cell, v);
    }
  }

  private set(cell: string, v: number): void {
    const value = clamp01(v);
    if (value < 0.01) this.values.delete(cell);
    else this.values.set(cell, value);
  }

  private emit(changed: string[] | null): void {
    this.listeners.forEach((fn) => fn(changed));
  }
}

export function heatCellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}
