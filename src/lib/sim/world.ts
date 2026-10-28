import { cellToParent, gridDisk } from 'h3-js';
import {
  CATEGORY_MIX,
  DEFAULT_DRIVER_COUNT,
  DEFAULT_SIM_SPEED,
  DEMAND,
  H3_RES
} from '@/lib/sim/config';
import { CATEGORY_LIST, type Category } from '@/lib/sim/types';
import {
  createDriver,
  stepDriver,
  stopDriver,
  type Driver,
  type RoamTarget
} from '@/lib/sim/driver';
import { haversine } from '@/lib/sim/geo';
import {
  createHeatMap,
  heatCellCenter,
  toHeatCell,
  type HeatMap
} from '@/lib/sim/heat';
import {
  createLocationIndex,
  type LocationIndex
} from '@/lib/sim/locationIndex';
import { nearestNode } from '@/lib/sim/routing/roads';

/** Category for the i-th of n drivers, so the fleet matches CATEGORY_MIX. */
function categoryFor(i: number, n: number): Category {
  let acc = 0;
  for (const c of CATEGORY_LIST) {
    acc += CATEGORY_MIX[c];
    if ((i + 0.5) / n < acc) return c;
  }
  return 'UberX';
}

/** The fleet, the sim clock and demand. The UI reads and sets the plain fields. */
export interface World {
  readonly drivers: Map<number, Driver>;
  readonly index: LocationIndex;
  readonly heat: HeatMap;
  /** Simulated seconds since start. */
  simTime: number;
  speed: number;
  paused: boolean;
  /** Called after drivers are added or removed; returns an unsubscribe function. */
  onFleetChange: (fn: () => void) => () => void;
  setDriverCount: (n: number) => void;
  tick: (realDtS: number) => void;
}

export function createWorld(): World {
  const drivers = new Map<number, Driver>();
  const index = createLocationIndex();
  const heat = createHeatMap();
  const fleetListeners = new Set<() => void>();
  /** Cells hot enough to be worth a long drive, refreshed when demand changes. */
  let hotCells: string[] = [];
  /** Sim time at which each idle driver drops its roam to re-plan. */
  const replanAt = new Map<number, number>();
  let nextId = 0;

  const world: World = {
    drivers,
    index,
    heat,
    simTime: 0,
    speed: DEFAULT_SIM_SPEED,
    paused: false,
    onFleetChange(fn) {
      fleetListeners.add(fn);
      return () => {
        fleetListeners.delete(fn);
      };
    },
    setDriverCount,
    tick
  };

  function setDriverCount(n: number): void {
    const target = Math.max(4, n);
    // Rebuild the category mix for the new size, keeping drivers who are busy.
    while (drivers.size < target) {
      const id = nextId++;
      const d = createDriver(id, categoryFor(drivers.size, target));
      d.cell = index.update(d.id, d.pos.lat, d.pos.lng);
      drivers.set(id, d);
    }
    for (const d of [...drivers.values()].reverse()) {
      if (drivers.size <= target) break;
      if (d.state !== 'idle') continue;
      index.remove(d.id);
      drivers.delete(d.id);
    }
    fleetListeners.forEach((fn) => fn());
  }

  function tick(realDtS: number): void {
    if (world.paused) return;
    // Clamp so a backgrounded tab doesn't teleport everyone when it wakes up.
    world.simTime += Math.min(realDtS, 1) * world.speed;
    for (const d of drivers.values()) {
      const at = replanAt.get(d.id);
      if (at !== undefined && world.simTime >= at) {
        replanAt.delete(d.id);
        if (d.state === 'idle') stopDriver(d);
      }
      stepDriver(d, world.simTime, pickRoam);
      d.cell = index.update(d.id, d.pos.lat, d.pos.lng);
    }
  }

  /** Stagger idle drivers' re-plans over a few real seconds so they peel off one by one. */
  function onHeatChange(): void {
    hotCells = heat
      .entries()
      .filter(([, v]) => v >= 0.25)
      .map(([cell]) => cell);
    for (const d of drivers.values()) {
      if (d.state !== 'idle' || replanAt.has(d.id)) continue;
      const delayS = Math.random() * DEMAND.replanWithinS * world.speed;
      replanAt.set(d.id, world.simTime + delayS);
    }
  }

  /**
   * Pick where an idle driver roams next. Each nearby (plus a sample of far)
   * hot cell scores demand² divided by how many idle cars already sit in or
   * head to its area, fading with distance; the driver then picks at random
   * among the best few. Crowded spots lose their pull, so cars spread across
   * every hot area instead of piling into the single hottest one.
   */
  function pickRoam(driver: Driver): RoamTarget | null {
    if (heat.size === 0 || Math.random() < DEMAND.explore) return null;

    const crowd = new Map<string, number>();
    for (const other of drivers.values()) {
      if (other === driver || other.state !== 'idle') continue;
      const area = other.roamCell
        ? cellToParent(other.roamCell, H3_RES)
        : other.cell;
      crowd.set(area, (crowd.get(area) ?? 0) + 1);
    }

    const candidates = new Set(
      gridDisk(toHeatCell(driver.pos), DEMAND.searchRings)
    );
    for (let i = 0; i < DEMAND.farSamples && hotCells.length > 0; i++) {
      candidates.add(hotCells[Math.floor(Math.random() * hotCells.length)]);
    }

    const scored: [string, number][] = [];
    for (const cell of candidates) {
      const demand = heat.get(cell);
      if (demand < 0.05) continue;
      const cars = crowd.get(cellToParent(cell, H3_RES)) ?? 0;
      const km = haversine(driver.pos, heatCellCenter(cell)) / 1000;
      const score =
        (demand * demand) /
        (1 + DEMAND.crowdPenalty * cars) /
        (1 + km / DEMAND.halfPullKm);
      scored.push([cell, score]);
    }
    if (scored.length === 0) return null;

    const shortlist = scored
      .sort((a, b) => b[1] - a[1])
      .slice(0, DEMAND.shortlist);
    let roll = Math.random() * shortlist.reduce((sum, [, s]) => sum + s, 0);
    let [cell] = shortlist[0];
    for (const [c, s] of shortlist) {
      cell = c;
      if ((roll -= s) <= 0) break;
    }
    return { node: nearestNode(heatCellCenter(cell)), cell };
  }

  heat.onChange(() => onHeatChange());
  heat.randomize();
  setDriverCount(DEFAULT_DRIVER_COUNT);
  return world;
}
