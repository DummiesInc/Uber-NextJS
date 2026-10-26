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

/** Moves a point along a polyline over a fixed (simulated) duration. */
export class PathFollower {
  private cum: number[] = [0];
  readonly length: number;

  constructor(
    readonly points: LatLng[],
    readonly durationS: number
  ) {
    for (let i = 1; i < points.length; i++) {
      this.cum.push(this.cum[i - 1] + haversine(points[i - 1], points[i]));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Position and heading after `elapsedS` simulated seconds. */
  at(elapsedS: number): { pos: LatLng; heading: number; done: boolean } {
    const pts = this.points;
    if (pts.length < 2 || this.length === 0) {
      return { pos: pts[pts.length - 1], heading: 0, done: true };
    }
    const t = Math.min(
      1,
      Math.max(0, elapsedS / Math.max(this.durationS, 0.001))
    );
    const target = t * this.length;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < target) i++;
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    const f = (target - this.cum[i - 1]) / segLen;
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

  remainingS(elapsedS: number): number {
    return Math.max(0, this.durationS - elapsedS);
  }

  remainingM(elapsedS: number): number {
    const t = Math.min(1, elapsedS / Math.max(this.durationS, 0.001));
    return this.length * (1 - t);
  }
}
