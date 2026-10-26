import {
  CATEGORY_MIX,
  DEFAULT_DRIVER_COUNT,
  DEFAULT_SIM_SPEED
} from '@/lib/sim/config';
import { CATEGORY_LIST, type Category } from '@/lib/sim/types';
import { Driver } from '@/lib/sim/driver';
import { LocationIndex } from '@/lib/sim/locationIndex';

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
  /** Simulated seconds since start. */
  simTime = 0;
  speed = DEFAULT_SIM_SPEED;
  paused = false;
  private nextId = 0;
  private listeners = new Set<() => void>();

  constructor() {
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
      d.step(this.simTime);
      d.cell = this.index.update(d.id, d.pos.lat, d.pos.lng);
    }
  }
}
