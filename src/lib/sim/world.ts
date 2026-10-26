import { cellToParent, gridDisk } from 'h3-js';
import {
  CATEGORY_MIX,
  DEFAULT_DRIVER_COUNT,
  DEFAULT_SIM_SPEED,
  DEMAND,
  H3_RES
} from '@/lib/sim/config';
import { CATEGORY_LIST, type Category } from '@/lib/sim/types';
import { Driver, type RoamTarget } from '@/lib/sim/driver';
import { haversine } from '@/lib/sim/geo';
import { HeatMap, heatCellCenter, toHeatCell } from '@/lib/sim/heat';
import { LocationIndex } from '@/lib/sim/locationIndex';
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

export class World {
  readonly drivers = new Map<number, Driver>();
  readonly index = new LocationIndex();
  readonly heat = new HeatMap();
  /** Simulated seconds since start. */
  simTime = 0;
  speed = DEFAULT_SIM_SPEED;
  paused = false;
  private nextId = 0;
  private listeners = new Set<() => void>();
  /** Cells hot enough to be worth a long drive, refreshed when demand changes. */
  private hotCells: string[] = [];
  /** Sim time at which each idle driver drops its roam to re-plan. */
  private replanAt = new Map<number, number>();

  constructor() {
    this.heat.onChange(() => this.onHeatChange());
    this.heat.randomize();
    this.setDriverCount(DEFAULT_DRIVER_COUNT);
  }

  onFleetChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setDriverCount(n: number): void {
    const target = Math.max(4, n);
    // Rebuild the category mix for the new size, keeping drivers who are busy.
    while (this.drivers.size < target) {
      const id = this.nextId++;
      const d = Driver.random(id, categoryFor(this.drivers.size, target));
      d.cell = this.index.update(d.id, d.pos.lat, d.pos.lng);
      this.drivers.set(id, d);
    }
    for (const d of [...this.drivers.values()].reverse()) {
      if (this.drivers.size <= target) break;
      if (d.state !== 'idle') continue;
      this.index.remove(d.id);
      this.drivers.delete(d.id);
    }
    this.listeners.forEach((fn) => fn());
  }

  tick(realDtS: number): void {
    if (this.paused) return;
    // Clamp so a backgrounded tab doesn't teleport everyone when it wakes up.
    this.simTime += Math.min(realDtS, 1) * this.speed;
    for (const d of this.drivers.values()) {
      const at = this.replanAt.get(d.id);
      if (at !== undefined && this.simTime >= at) {
        this.replanAt.delete(d.id);
        if (d.state === 'idle') d.stop();
      }
      d.step(this.simTime, this.pickRoam);
      d.cell = this.index.update(d.id, d.pos.lat, d.pos.lng);
    }
  }

  /** Stagger idle drivers' re-plans over a few real seconds so they peel off one by one. */
  private onHeatChange(): void {
    this.hotCells = this.heat
      .entries()
      .filter(([, v]) => v >= 0.25)
      .map(([cell]) => cell);
    for (const d of this.drivers.values()) {
      if (d.state !== 'idle' || this.replanAt.has(d.id)) continue;
      const delayS = Math.random() * DEMAND.replanWithinS * this.speed;
      this.replanAt.set(d.id, this.simTime + delayS);
    }
  }

  /**
   * Pick where an idle driver roams next. Each nearby (plus a sample of far)
   * hot cell scores demand² divided by how many idle cars already sit in or
   * head to its area, fading with distance; the driver then picks at random
   * among the best few. Crowded spots lose their pull, so cars spread across
   * every hot area instead of piling into the single hottest one.
   */
  private pickRoam = (driver: Driver): RoamTarget | null => {
    if (this.heat.size === 0 || Math.random() < DEMAND.explore) return null;

    const crowd = new Map<string, number>();
    for (const other of this.drivers.values()) {
      if (other === driver || other.state !== 'idle') continue;
      const area = other.roamCell
        ? cellToParent(other.roamCell, H3_RES)
        : other.cell;
      crowd.set(area, (crowd.get(area) ?? 0) + 1);
    }

    const candidates = new Set(
      gridDisk(toHeatCell(driver.pos), DEMAND.searchRings)
    );
    for (let i = 0; i < DEMAND.farSamples && this.hotCells.length > 0; i++) {
      candidates.add(
        this.hotCells[Math.floor(Math.random() * this.hotCells.length)]
      );
    }

    const scored: [string, number][] = [];
    for (const cell of candidates) {
      const demand = this.heat.get(cell);
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
  };
}
