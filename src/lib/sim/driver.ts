import { CAR_COLORS, CARS, DRIVER_NAMES } from '@/lib/sim/data/names';
import { createPath, pathAt, type Path } from '@/lib/sim/geo';
import type { Persona } from '@/lib/sim/drivers/personas';
import {
  nearestNode,
  nodePos,
  randomNode,
  randomNodeNear,
  roadRoute
} from '@/lib/sim/routing/roads';
import type { BrainKind, Category, DriverState, LatLng } from '@/lib/sim/types';

/** Where an idle driver should roam next: a road node and its heat cell. */
export interface RoamTarget {
  node: number;
  cell: string;
}
export type RoamPicker = (driver: Driver) => RoamTarget | null;

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** One car on the map: plain data, moved by the functions below. */
export interface Driver {
  readonly id: number;
  readonly name: string;
  readonly category: Category;
  /** Base chance (0.25–0.95) of saying yes to an offer. */
  readonly acceptChance: number;
  readonly car: string;
  readonly rating: number;
  state: DriverState;
  pos: LatLng;
  cell: string;
  heading: number;
  brain: BrainKind;
  persona: Persona | null;
  earnings: number;
  trips: number;
  /** Path being driven, or null when the driver needs a new one. */
  path: Path | null;
  /** Sim time the current path started. */
  pathStartedAt: number;
  /** Fires once when the current path's end is reached. */
  onArrive: (() => void) | null;
  /** Road node the current roam ends at (null while on an OSRM trip). */
  roadNode: number | null;
  /** Heat cell the current roam is heading for (null when roaming at random). */
  roamCell: string | null;
}

/** A new idle driver at a random road node. */
export function createDriver(id: number, category: Category): Driver {
  return {
    id,
    name: DRIVER_NAMES[id % DRIVER_NAMES.length],
    category,
    acceptChance: Math.round((0.25 + Math.random() * 0.7) * 100) / 100,
    car: `${pick(CAR_COLORS)} ${pick(CARS[category])}`,
    rating: Math.round((4.6 + Math.random() * 0.39) * 100) / 100,
    state: 'idle',
    pos: nodePos(randomNode()),
    cell: '',
    heading: 0,
    brain: 'rule',
    persona: null,
    earnings: 0,
    trips: 0,
    path: null,
    pathStartedAt: 0,
    onArrive: null,
    roadNode: null,
    roamCell: null
  };
}

/** Follow a path from where the driver is; `onArrive` fires once at its end. */
export function followRoute(
  driver: Driver,
  points: LatLng[],
  durationS: number,
  simNow: number,
  onArrive?: () => void
): Path {
  driver.path = createPath([driver.pos, ...points], durationS);
  driver.pathStartedAt = simNow;
  driver.onArrive = onArrive ?? null;
  driver.roadNode = null;
  driver.roamCell = null;
  return driver.path;
}

/** Simulated seconds spent on the current path. */
export const driverElapsed = (driver: Driver, simNow: number): number =>
  simNow - driver.pathStartedAt;

/** Stop whatever path is in progress (keeps the current position). */
export function stopDriver(driver: Driver): void {
  driver.path = null;
  driver.onArrive = null;
  driver.roadNode = null;
  driver.roamCell = null;
}

/** Advance along the current path; idle/offered drivers roam when they run out. */
export function stepDriver(
  driver: Driver,
  simNow: number,
  pickRoam?: RoamPicker
): void {
  if (!driver.path) {
    if (driver.state === 'idle' || driver.state === 'offered') {
      roam(driver, simNow, pickRoam);
    }
    return;
  }
  const { pos, heading, done } = pathAt(
    driver.path,
    driverElapsed(driver, simNow)
  );
  driver.pos = pos;
  if (driver.path.length > 0) driver.heading = heading;
  if (done) {
    const cb = driver.onArrive;
    driver.path = null;
    driver.onArrive = null;
    cb?.();
  }
}

/**
 * Drive toward the spot `pickRoam` chooses, or to a random spot a few hexes
 * away when it has none, along real roads.
 */
function roam(driver: Driver, simNow: number, pickRoam?: RoamPicker): void {
  const from = driver.roadNode ?? nearestNode(driver.pos);
  const target = pickRoam?.(driver);
  if (target && target.node !== from) {
    const route = roadRoute(from, target.node);
    if (route && route.points.length >= 2) {
      followRoute(driver, route.points, route.durationS, simNow);
      driver.roadNode = target.node;
      driver.roamCell = target.cell;
      return;
    }
  }
  for (let tries = 0; tries < 4; tries++) {
    const to = randomNodeNear(driver.pos, 5);
    const route = to === from ? null : roadRoute(from, to);
    if (!route || route.points.length < 2) continue;
    followRoute(driver, route.points, route.durationS, simNow);
    driver.roadNode = to;
    return;
  }
}
