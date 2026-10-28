import type { LatLng } from '@/lib/sim/types';

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A polyline driven over a fixed (simulated) duration. */
export interface Path {
  readonly points: LatLng[];
  readonly durationS: number;
  /** Total length in meters. */
  readonly length: number;
  /** Distance from the start to each point, precomputed for `pathAt`. */
  readonly cumulative: number[];
}

export function createPath(points: LatLng[], durationS: number): Path {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
  }
  return {
    points,
    durationS,
    length: cumulative[cumulative.length - 1],
    cumulative
  };
}

const progress = (path: Path, elapsedS: number): number =>
  Math.min(1, Math.max(0, elapsedS / Math.max(path.durationS, 0.001)));

/** Position and heading after `elapsedS` simulated seconds. */
export function pathAt(
  path: Path,
  elapsedS: number
): { pos: LatLng; heading: number; done: boolean } {
  const pts = path.points;
  const cum = path.cumulative;
  if (pts.length < 2 || path.length === 0) {
    return { pos: pts[pts.length - 1], heading: 0, done: true };
  }
  const t = progress(path, elapsedS);
  const target = t * path.length;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (target - cum[i - 1]) / segLen;
  const a = pts[i - 1];
  const b = pts[i];
  return {
    pos: {
      lat: a.lat + (b.lat - a.lat) * f,
      lng: a.lng + (b.lng - a.lng) * f
    },
    heading: bearing(a, b),
    done: t >= 1
  };
}

export const pathRemainingS = (path: Path, elapsedS: number): number =>
  Math.max(0, path.durationS - elapsedS);

export const pathRemainingM = (path: Path, elapsedS: number): number =>
  path.length * (1 - Math.min(1, elapsedS / Math.max(path.durationS, 0.001)));
