import type { Driver } from '@/lib/sim/driver';
import type { Category, Place, Ride, Route } from '@/lib/sim/types';

export type OfferOutcome = 'accepted' | 'declined' | 'timeout';

export type SimEvent =
  | { type: 'pickup_selected'; place: Place; cell: string }
  | { type: 'trip_previewed'; place: Place; route: Route; cells: string[] }
  | { type: 'preview_cleared' }
  | { type: 'ride_requested'; ride: Ride }
  | {
      type: 'ring_searched';
      ride: Ride;
      k: number;
      cells: string[];
      found: number;
    }
  | {
      type: 'offer_sent';
      ride: Ride;
      driver: Driver;
      k: number;
      startedAt: number;
      deadline: number;
    }
  | {
      type: 'offer_result';
      ride: Ride;
      driver: Driver;
      outcome: OfferOutcome;
      reason: string;
      afterMs: number;
    }
  | { type: 'no_drivers'; ride: Ride; category: Category }
  | { type: 'driver_assigned'; ride: Ride; driver: Driver; route: Route }
  | { type: 'driver_arrived'; ride: Ride; driver: Driver }
  | { type: 'picked_up'; ride: Ride; driver: Driver }
  | { type: 'dropped_off'; ride: Ride; driver: Driver }
  | { type: 'ride_cancelled'; ride: Ride }
  | { type: 'reset' };

type Handler = (e: SimEvent) => void;

/** One stream that the map, the dispatch feed and the phone all subscribe to. */
export interface EventBus {
  /** Subscribe; returns an unsubscribe function. */
  on: (handler: Handler) => () => void;
  emit: (event: SimEvent) => void;
}

export function createEventBus(): EventBus {
  const handlers = new Set<Handler>();
  return {
    on(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    emit(event) {
      for (const h of handlers) h(event);
    }
  };
}
