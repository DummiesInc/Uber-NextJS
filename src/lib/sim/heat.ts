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
export interface HeatMap {
  get: (cell: string) => number;
  /**
   * Total demand under a cell of any level: the res-9 value itself, or the
   * sum of its res-9 children for res 7 and 8.
   */
  total: (cell: string) => number;
  /** The largest total of any cell at `res`. */
  maxAt: (res: HeatLevel) => number;
  /**
   * A cell's share of demand relative to the busiest cell at its own level,
   * 0–1, so the hottest cell is the darkest at every zoom.
   */
  intensity: (cell: string) => number;
  at: (p: LatLng) => number;
  entries: () => [string, number][];
  readonly size: number;
  onChange: (fn: HeatListener) => () => void;
  /**
   * Scatter 8–14 hot spots of different sizes over the city, half of them on
   * real pickup spots, on top of a faint background, so demand never pools in
   * one place.
   */
  randomize: () => void;
  /**
   * Raise (or with `erase`, lower) demand around `p`, fading out over `rings`
   * cells of level `res`. At res 7 or 8 every res-9 child of a brushed cell
   * gets that cell's share, so one dab covers a whole parent.
   */
  paint: (
    p: LatLng,
    rings: number,
    strength: number,
    erase?: boolean,
    res?: HeatLevel
  ) => void;
  clear: () => void;
  /** Plain object form, for saving a painted map. */
  toJSON: () => Record<string, number>;
  load: (saved: Record<string, number>) => void;
}

export function createHeatMap(): HeatMap {
  const values = new Map<string, number>();
  const listeners = new Set<HeatListener>();
  /** res 7 / res 8 cell -> sum of its res-9 children, kept in step by set(). */
  const totals = new Map<HeatLevel, Map<string, number>>(
    ROLLUP_LEVELS.map((res: HeatLevel) => [res, new Map<string, number>()])
  );
  /** Busiest cell total per level, recomputed lazily after a change. */
  const maxByLevel = new Map<HeatLevel, number>();

  const get = (cell: string): number => values.get(cell) ?? 0;

  const total = (cell: string): number => {
    const res = getResolution(cell) as HeatLevel;
    if (res === HEAT_RES) return get(cell);
    return totals.get(res)?.get(cell) ?? 0;
  };

  const maxAt = (res: HeatLevel): number => {
    let max: number | undefined = maxByLevel.get(res);
    if (max === undefined) {
      max = 0;
      const source: Iterable<number> =
        res === HEAT_RES ? values.values() : totals.get(res)!.values();
      for (const v of source) max = Math.max(max, v);
      maxByLevel.set(res, max);
    }
    return max;
  };

  const set = (cell: string, v: number): void => {
    let value = clamp01(v);
    if (value < 0.01) value = 0;
    const delta: number = value - get(cell);
    if (value === 0) values.delete(cell);
    else values.set(cell, value);
    if (delta === 0) return;
    for (const res of ROLLUP_LEVELS) {
      const levelTotals = totals.get(res)!;
      const parent: string = cellToParent(cell, res);
      // Clamp float drift so an emptied parent reads exactly 0.
      const next: number = (levelTotals.get(parent) ?? 0) + delta;
      if (next < 1e-6) levelTotals.delete(parent);
      else levelTotals.set(parent, next);
    }
  };

  const reset = (): void => {
    values.clear();
    totals.forEach((levelTotals: Map<string, number>) => levelTotals.clear());
  };

  const emit = (changed: string[] | null): void => {
    maxByLevel.clear();
    listeners.forEach((fn) => fn(changed));
  };

  /** A soft round hot spot; overlapping spots keep the higher value. */
  const blob = (center: string, rings: number, peak: number): void => {
    for (const cell of gridDisk(center, rings)) {
      if (!HEAT_SET.has(cell)) continue;
      const d = gridDistance(center, cell) / rings;
      const v = peak * Math.exp(-2.5 * d * d);
      if (v > get(cell)) set(cell, v);
    }
  };

  return {
    get,
    total,
    maxAt,
    intensity(cell) {
      const max: number = maxAt(getResolution(cell) as HeatLevel);
      return max > 0 ? Math.min(1, total(cell) / max) : 0;
    },
    at: (p) => get(toHeatCell(p)),
    entries: () => [...values],
    get size() {
      return values.size;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    randomize() {
      reset();
      for (const cell of HEAT_CELLS) {
        if (Math.random() < 0.35) set(cell, rand(0.03, 0.12));
      }
      const spots = Math.round(rand(8, 14));
      for (let i = 0; i < spots; i++) {
        const center =
          Math.random() < 0.5
            ? toHeatCell(
                LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
              )
            : HEAT_CELLS[Math.floor(Math.random() * HEAT_CELLS.length)];
        blob(center, Math.round(rand(2, 6)), rand(0.45, 1));
      }
      emit(null);
    },
    paint(p, rings, strength, erase = false, res = HEAT_RES) {
      const center: string = latLngToCell(p.lat, p.lng, res);
      const changed: string[] = [];
      for (const cell of gridDisk(center, rings)) {
        const falloff = 1 - gridDistance(center, cell) / (rings + 1);
        const delta = strength * falloff * (erase ? -1 : 1);
        for (const child of heatDescendants(cell)) {
          set(child, get(child) + delta);
          changed.push(child);
        }
      }
      if (changed.length > 0) emit(changed);
    },
    clear() {
      reset();
      emit(null);
    },
    toJSON: () => Object.fromEntries(values),
    load(saved) {
      reset();
      for (const [cell, v] of Object.entries(saved)) {
        if (HEAT_SET.has(cell) && typeof v === 'number') set(cell, v);
      }
      emit(null);
    }
  };
}

export function heatCellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}
