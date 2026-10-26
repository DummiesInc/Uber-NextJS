import { gridDisk, latLngToCell } from 'h3-js';
import { H3_RES } from '@/lib/sim/config';
import roads from '@/lib/sim/data/roads.json';
import { haversine } from '@/lib/sim/geo';
import type { LatLng, Route } from '@/lib/sim/types';

/**
 * Local road router over Omaha's main streets (built by scripts/build-roads.mjs
 * from OpenStreetMap). Roaming drivers use this so they stay on real roads
 * without hitting any routing server.
 */

type RawEdge = [number, number, number, number, number[]];
const raw = roads as { nodes: [number, number][]; edges: RawEdge[] };

const NODES: LatLng[] = raw.nodes.map(([lat, lng]) => ({ lat, lng }));
const MAX_SPEED = Math.max(...raw.edges.map((e) => e[3]));

/** adjacency[n] = list of edge indices touching node n */
const adjacency: number[][] = NODES.map(() => []);
raw.edges.forEach(([a, b], i) => {
  adjacency[a].push(i);
  adjacency[b].push(i);
});

/** Road nodes bucketed by H3 cell, so "nearest node" only looks at nearby hexes. */
const nodesByCell = new Map<string, number[]>();
NODES.forEach((p, i) => {
  const cell = latLngToCell(p.lat, p.lng, H3_RES);
  let list = nodesByCell.get(cell);
  if (!list) nodesByCell.set(cell, (list = []));
  list.push(i);
});

export const roadNodeCount = NODES.length;
export const nodePos = (n: number): LatLng => NODES[n];

export function nearestNode(p: LatLng): number {
  const origin = latLngToCell(p.lat, p.lng, H3_RES);
  for (let k = 0; k <= 6; k++) {
    let best = -1;
    let bestD = Infinity;
    for (const cell of gridDisk(origin, k)) {
      for (const n of nodesByCell.get(cell) ?? []) {
        const d = haversine(p, NODES[n]);
        if (d < bestD) [best, bestD] = [n, d];
      }
    }
    if (best >= 0) return best;
  }
  return Math.floor(Math.random() * NODES.length);
}

/** A random road node somewhere within `rings` hexes of `p`. */
export function randomNodeNear(p: LatLng, rings: number): number {
  const cells = gridDisk(latLngToCell(p.lat, p.lng, H3_RES), rings).filter(
    (c) => nodesByCell.has(c)
  );
  if (cells.length === 0) return Math.floor(Math.random() * NODES.length);
  const list = nodesByCell.get(
    cells[Math.floor(Math.random() * cells.length)]
  )!;
  return list[Math.floor(Math.random() * list.length)];
}

export const randomNode = () => Math.floor(Math.random() * NODES.length);

/** Edge shape from `from` to the other end, excluding the start node. */
function edgePoints(ei: number, from: number): LatLng[] {
  const [a, b, , , g] = raw.edges[ei];
  const mid: LatLng[] = [];
  for (let i = 0; i < g.length; i += 2) mid.push({ lat: g[i], lng: g[i + 1] });
  if (from !== a) mid.reverse();
  mid.push(NODES[from === a ? b : a]);
  return mid;
}

/** Fastest path between two road nodes (A* on drive time). */
export function roadRoute(start: number, goal: number): Route | null {
  if (start === goal)
    return {
      points: [NODES[start]],
      distanceM: 0,
      durationS: 0,
      source: 'roads'
    };
  const g = new Map<number, number>([[start, 0]]);
  const via = new Map<number, number>(); // node -> edge used to reach it
  const heap = new MinHeap();
  const h = (n: number) => haversine(NODES[n], NODES[goal]) / MAX_SPEED;
  heap.push(start, h(start));
  const closed = new Set<number>();

  while (heap.size) {
    const n = heap.pop();
    if (n === goal) break;
    if (closed.has(n)) continue;
    closed.add(n);
    const gn = g.get(n)!;
    for (const ei of adjacency[n]) {
      const [a, b, len, speed] = raw.edges[ei];
      const m = a === n ? b : a;
      const cost = gn + len / speed;
      if (cost < (g.get(m) ?? Infinity)) {
        g.set(m, cost);
        via.set(m, ei);
        heap.push(m, cost + h(m));
      }
    }
  }
  if (!via.has(goal)) return null;

  // Walk back from the goal, then expand each edge's shape in travel order.
  const chain: [number, number][] = [];
  for (let n = goal; n !== start;) {
    const ei = via.get(n)!;
    const [a, b] = raw.edges[ei];
    const prev = a === n ? b : a;
    chain.push([ei, prev]);
    n = prev;
  }
  chain.reverse();
  const points: LatLng[] = [NODES[start]];
  let distanceM = 0;
  for (const [ei, from] of chain) {
    points.push(...edgePoints(ei, from));
    distanceM += raw.edges[ei][2];
  }
  return { points, distanceM, durationS: g.get(goal)!, source: 'roads' };
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    const items = this.items;
    const prio = this.prio;
    let i = items.length;
    items.push(item);
    prio.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= p) break;
      items[i] = items[parent];
      prio[i] = prio[parent];
      i = parent;
    }
    items[i] = item;
    prio[i] = p;
  }

  pop(): number {
    const items = this.items;
    const prio = this.prio;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastP = prio.pop()!;
    if (items.length > 0) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && prio[r] < prio[l] ? r : l;
        if (prio[c] >= lastP) break;
        items[i] = items[c];
        prio[i] = prio[c];
        i = c;
      }
      items[i] = lastItem;
      prio[i] = lastP;
    }
    return top;
  }
}
