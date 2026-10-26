import { FALLBACK_ROUTE_SPEED } from '@/lib/sim/config';
import { haversine } from '@/lib/sim/geo';
import { hexPath, toCell } from '@/lib/sim/grid';
import { nearestNode, roadRoute } from '@/lib/sim/routing/roads';
import type { LatLng, Route } from '@/lib/sim/types';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
}

/**
 * Road route from the public OSRM demo server. When it's unreachable, falls
 * back to the bundled main-roads graph, and as a last resort an H3 cell path.
 */
export async function fetchRoute(from: LatLng, to: LatLng): Promise<Route> {
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as OsrmResponse;
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r) throw new Error(`OSRM ${data.code}`);
    return {
      points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceM: r.distance,
      durationS: r.duration,
      source: 'osrm'
    };
  } catch (err) {
    console.warn('OSRM unavailable, using local road graph', err);
    const local = roadRoute(nearestNode(from), nearestNode(to));
    if (local) return { ...local, points: [from, ...local.points, to] };
    return hexRoute(from, to);
  }
}

export function hexRoute(from: LatLng, to: LatLng): Route {
  const points = [from, ...hexPath(toCell(from), toCell(to)).slice(1, -1), to];
  const distanceM = points.reduce(
    (d, p, i) => (i ? d + haversine(points[i - 1], p) : d),
    0
  );
  return {
    points,
    distanceM,
    durationS: distanceM / FALLBACK_ROUTE_SPEED,
    source: 'hex'
  };
}
