import { CAR_COLORS, CARS, DRIVER_NAMES } from '@/lib/sim/data/names';
import { PathFollower } from '@/lib/sim/geo';
import type { Persona } from '@/lib/sim/drivers/personas';
import {
  nearestNode,
  nodePos,
  randomNode,
  randomNodeNear,
  roadRoute
} from '@/lib/sim/routing/roads';
import type { BrainKind, Category, DriverState, LatLng } from '@/lib/sim/types';

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class Driver {
  state: DriverState = 'idle';
  pos: LatLng;
  cell = '';
  heading = 0;
  brain: BrainKind = 'rule';
  persona: Persona | null = null;
  earnings = 0;
  trips = 0;

  /** Current path and the sim time it started. */
  private follower: PathFollower | null = null;
  private startedAt = 0;
  private onArrive: (() => void) | null = null;
  /** Road node the current roam ends at (null while on an OSRM trip). */
  private roadNode: number | null = null;

  readonly car: string;
  readonly rating: number;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly category: Category,
    /** Base chance (0.25–0.95) of saying yes to an offer. */
    readonly acceptChance: number,
    start: LatLng
  ) {
    this.pos = start;
    this.car = `${pick(CAR_COLORS)} ${pick(CARS[category])}`;
    this.rating = Math.round((4.6 + Math.random() * 0.39) * 100) / 100;
  }

  static random(id: number, category: Category): Driver {
    const start = nodePos(randomNode());
    const chance = Math.round((0.25 + Math.random() * 0.7) * 100) / 100;
    return new Driver(
      id,
      DRIVER_NAMES[id % DRIVER_NAMES.length],
      category,
      chance,
      start
    );
  }

  /** Follow a path; `onArrive` fires once when the end is reached. */
  follow(
    points: LatLng[],
    durationS: number,
    simNow: number,
    onArrive?: () => void
  ): PathFollower {
    this.follower = new PathFollower([this.pos, ...points], durationS);
    this.startedAt = simNow;
    this.onArrive = onArrive ?? null;
    this.roadNode = null;
    return this.follower;
  }

  get activePath(): PathFollower | null {
    return this.follower;
  }

  elapsed(simNow: number): number {
    return simNow - this.startedAt;
  }

  /** Advance along the current path; idle/offered drivers roam when they run out. */
  step(simNow: number): void {
    if (!this.follower) {
      if (this.state === 'idle' || this.state === 'offered') this.roam(simNow);
      return;
    }
    const { pos, heading, done } = this.follower.at(simNow - this.startedAt);
    this.pos = pos;
    if (this.follower.length > 0) this.heading = heading;
    if (done) {
      const cb = this.onArrive;
      this.follower = null;
      this.onArrive = null;
      cb?.();
    }
  }

  /** Stop whatever path is in progress (keeps the current position). */
  stop(): void {
    this.follower = null;
    this.onArrive = null;
    this.roadNode = null;
  }

  /** Drive to a random spot a few hexes away, along real roads. */
  private roam(simNow: number): void {
    const from = this.roadNode ?? nearestNode(this.pos);
    for (let tries = 0; tries < 4; tries++) {
      const to = randomNodeNear(this.pos, 5);
      const route = to === from ? null : roadRoute(from, to);
      if (!route || route.points.length < 2) continue;
      this.follow(route.points, route.durationS, simNow);
      this.roadNode = to;
      return;
    }
  }
}
