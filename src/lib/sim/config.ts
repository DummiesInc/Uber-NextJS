import type { Category, LatLng } from '@/lib/sim/types';

/** H3 resolution used for the whole simulation (~0.74 km² per cell). */
export const H3_RES = 8;

/** Service area polygon (lat, lng) — downtown Omaha out to Lakeside Hills. */
export const SERVICE_AREA: LatLng[] = [
  { lat: 41.345, lng: -96.2 },
  { lat: 41.345, lng: -95.875 },
  { lat: 41.2, lng: -95.875 },
  { lat: 41.2, lng: -96.2 }
];

export const MAP_CENTER: LatLng = { lat: 41.262, lng: -96.035 };
export const MAP_ZOOM = 12;

export const DESTINATION = {
  name: 'Lakeside Hills Plaza',
  address: '17041 Lakeside Hills Plaza #102, Omaha, NE 68130',
  lat: 41.2360223,
  lng: -96.1817148
};

/** Simulated seconds per real second (trips, ETAs, roaming). */
export const DEFAULT_SIM_SPEED = 10;
/** Offer window, always in real wall-clock time. */
export const OFFER_TIMEOUT_MS = 15_000;
/** Furthest ring the dispatcher searches before waiting and retrying. */
export const MAX_K = 10;
/** Pause between ring expansions so the search is visible on the map. */
export const RING_STEP_MS = 350;
export const RETRY_MS = 4_000;

export const DEFAULT_DRIVER_COUNT = 30;
export const CATEGORY_MIX: Record<Category, number> = {
  UberX: 0.4,
  Priority: 0.2,
  Comfort: 0.2,
  UberXL: 0.2
};

/** Real-world speeds in m/s. */
export const FALLBACK_ROUTE_SPEED = 11;

export const PRICING = {
  base: 2.5,
  bookingFee: 2.0,
  perKm: 1.15,
  perMin: 0.28,
  minimum: 8
};

export const CATEGORIES: Record<
  Category,
  {
    multiplier: number;
    seats: number;
    blurb: string;
    color: string;
    pickupFactor: number;
  }
> = {
  UberX: {
    multiplier: 1.0,
    seats: 4,
    blurb: 'Affordable everyday rides',
    color: '#16a34a',
    pickupFactor: 1
  },
  Priority: {
    multiplier: 1.25,
    seats: 4,
    blurb: 'Faster pickup, direct to you',
    color: '#d97706',
    pickupFactor: 0.8
  },
  Comfort: {
    multiplier: 1.35,
    seats: 4,
    blurb: 'Newer cars, extra legroom',
    color: '#2563eb',
    pickupFactor: 1
  },
  UberXL: {
    multiplier: 1.7,
    seats: 6,
    blurb: 'Rides for groups up to 6',
    color: '#7c3aed',
    pickupFactor: 1
  }
};
