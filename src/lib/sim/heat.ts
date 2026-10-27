import {
  cellToLatLng,
  cellToParent,
  getResolution,
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

/**
 * The H3 levels the map can show, coarse to fine: res 7 (~5.2 km²) for the
 * whole city, res 8 (~0.74 km², dispatch) and res 9 (~0.1 km², raw demand).
 */
export const HEAT_LEVELS = [7, 8, 9] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

/** Coarser cell -> the res-9 service cells under it, built once per level. */
const DESCENDANTS = new Map<HeatLevel, Map<string, string[]>>(
  HEAT_LEVELS.map((res: HeatLevel) => {
    const byParent = new Map<string, string[]>();
    for (const cell of HEAT_CELLS) {
      const parent: string = res === HEAT_RES ? cell : cellToParent(cell, res);
      const children = byParent.get(parent);
      if (children) children.push(cell);
      else byParent.set(parent, [cell]);
    }
    return [res, byParent];
  })
);

/**
 * Every cell at `res` that has at least one res-9 service cell under it. At
 * res 7 and 8 this includes edge cells whose centre is just outside the area.
 */
export const cellsAtLevel = (res: HeatLevel): string[] => [
  ...DESCENDANTS.get(res)!.keys()
];

/** The res-9 service cells under `cell` (just `cell` itself at res 9). */
export const heatDescendants = (cell: string): string[] =>
  DESCENDANTS.get(getResolution(cell) as HeatLevel)?.get(cell) ?? [];

/** Levels above res 9 whose totals are rolled up as demand changes. */
const ROLLUP_LEVELS: HeatLevel[] = HEAT_LEVELS.filter(
  (res: HeatLevel) => res !== HEAT_RES
);

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
  /** res 7 / res 8 cell -> sum of its res-9 children, kept in step by set(). */
  private totals = new Map<HeatLevel, Map<string, number>>(
    ROLLUP_LEVELS.map((res: HeatLevel) => [res, new Map<string, number>()])
  );
  /** Busiest cell total per level, recomputed lazily after a change. */
  private maxByLevel = new Map<HeatLevel, number>();

  get(cell: string): number {
    return this.values.get(cell) ?? 0;
  }

  /**
   * Total demand under a cell of any level: the res-9 value itself, or the
   * sum of its res-9 children for res 7 and 8.
   */
  total(cell: string): number {
    const res = getResolution(cell) as HeatLevel;
    if (res === HEAT_RES) return this.get(cell);
    return this.totals.get(res)?.get(cell) ?? 0;
  }

  /** The largest total of any cell at `res`. */
  maxAt(res: HeatLevel): number {
    let max: number | undefined = this.maxByLevel.get(res);
    if (max === undefined) {
      max = 0;
      const source: Iterable<number> =
        res === HEAT_RES
          ? this.values.values()
          : this.totals.get(res)!.values();
      for (const v of source) max = Math.max(max, v);
      this.maxByLevel.set(res, max);
    }
    return max;
  }

  /**
   * A cell's share of demand relative to the busiest cell at its own level,
   * 0–1, so the hottest cell is the darkest at every zoom.
   */
  intensity(cell: string): number {
    const max: number = this.maxAt(getResolution(cell) as HeatLevel);
    return max > 0 ? Math.min(1, this.total(cell) / max) : 0;
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
    this.reset();
    for (const cell of HEAT_CELLS) {
      if (Math.random() < 0.35) this.set(cell, rand(0.03, 0.12));
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

  /**
   * Raise (or with `erase`, lower) demand around `p`, fading out over `rings`
   * cells of level `res`. At res 7 or 8 every res-9 child of a brushed cell
   * gets that cell's share, so one dab covers a whole parent.
   */
  paint(
    p: LatLng,
    rings: number,
    strength: number,
    erase = false,
    res: HeatLevel = HEAT_RES
  ): void {
    const center: string = latLngToCell(p.lat, p.lng, res);
    const changed: string[] = [];
    for (const cell of gridDisk(center, rings)) {
      const falloff = 1 - gridDistance(center, cell) / (rings + 1);
      const delta = strength * falloff * (erase ? -1 : 1);
      for (const child of heatDescendants(cell)) {
        this.set(child, this.get(child) + delta);
        changed.push(child);
      }
    }
    if (changed.length > 0) this.emit(changed);
  }

  clear(): void {
    this.reset();
    this.emit(null);
  }

  /** Plain object form, for saving a painted map. */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  load(saved: Record<string, number>): void {
    this.reset();
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
    let value = clamp01(v);
    if (value < 0.01) value = 0;
    const delta: number = value - this.get(cell);
    if (value === 0) this.values.delete(cell);
    else this.values.set(cell, value);
    if (delta === 0) return;
    for (const res of ROLLUP_LEVELS) {
      const totals = this.totals.get(res)!;
      const parent: string = cellToParent(cell, res);
      // Clamp float drift so an emptied parent reads exactly 0.
      const next: number = (totals.get(parent) ?? 0) + delta;
      if (next < 1e-6) totals.delete(parent);
      else totals.set(parent, next);
    }
  }

  private reset(): void {
    this.values.clear();
    this.totals.forEach((totals: Map<string, number>) => totals.clear());
  }

  private emit(changed: string[] | null): void {
    this.maxByLevel.clear();
    this.listeners.forEach((fn) => fn(changed));
  }
}

export function heatCellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}
