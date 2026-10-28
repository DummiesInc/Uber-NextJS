import { DESTINATION } from '@/lib/sim/config';
import type { EventBus } from '@/lib/sim/events';
import { fetchRoute } from '@/lib/sim/routing/osrm';
import { createDispatcher, type Quote } from '@/lib/sim/dispatch';
import { polylineToCells, toCell } from '@/lib/sim/grid';
import type { World } from '@/lib/sim/world';
import type { Category, Place, Ride, Route } from '@/lib/sim/types';

/** What the phone can ask the simulation to do. */
export interface App {
  /** The rider's chosen pickup, or null before one is picked. */
  pickup: Place | null;
  /** Pickup-to-destination route once it has loaded. */
  route: Route | null;
  selectPickup: (place: Place) => Promise<Route>;
  quotes: () => Quote[];
  request: (category: Category) => Ride;
  cancel: () => void;
  backToPickup: () => void;
  reset: () => void;
}

export function createApp(world: World, bus: EventBus): App {
  const dispatcher = createDispatcher(world, bus);

  const app: App = {
    pickup: null,
    route: null,
    async selectPickup(place) {
      app.pickup = place;
      app.route = null;
      bus.emit({ type: 'pickup_selected', place, cell: toCell(place) });
      const route = await fetchRoute(place, DESTINATION);
      if (app.pickup !== place) return route;
      app.route = route;
      bus.emit({
        type: 'trip_previewed',
        place,
        route,
        cells: polylineToCells(route.points)
      });
      return route;
    },
    quotes() {
      return app.pickup && app.route
        ? dispatcher.quote(app.pickup, app.route)
        : [];
    },
    request(category) {
      return dispatcher.request(app.pickup!, category, app.route!);
    },
    cancel() {
      dispatcher.cancel();
    },
    backToPickup() {
      app.pickup = null;
      app.route = null;
      bus.emit({ type: 'preview_cleared' });
    },
    reset() {
      app.pickup = null;
      app.route = null;
      dispatcher.ride = null;
      bus.emit({ type: 'reset' });
    }
  };
  return app;
}
