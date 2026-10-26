export type Category = 'UberX' | 'Priority' | 'Comfort' | 'UberXL';
export const CATEGORY_LIST: Category[] = [
  'UberX',
  'Priority',
  'Comfort',
  'UberXL'
];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  name: string;
  area: string;
}

export type DriverState = 'idle' | 'offered' | 'toPickup' | 'onTrip';
export type BrainKind = 'rule' | 'llm';

export interface Route {
  points: LatLng[];
  distanceM: number;
  /** Real-world seconds. */
  durationS: number;
  source: 'osrm' | 'roads' | 'hex';
}

export type RideStatus =
  | 'searching'
  | 'driverEnRoute'
  | 'driverArrived'
  | 'onTrip'
  | 'completed'
  | 'cancelled';

export interface Ride {
  id: number;
  pickup: Place;
  pickupCell: string;
  category: Category;
  fare: number;
  route: Route;
  status: RideStatus;
  declinedBy: Set<number>;
  driverId: number | null;
  requestedAt: number;
}

export interface Offer {
  rideId: number;
  category: Category;
  pickupName: string;
  pickupCells: number;
  pickupKm: number;
  tripKm: number;
  tripMin: number;
  fare: number;
}

export interface Decision {
  accept: boolean;
  reason: string;
}
