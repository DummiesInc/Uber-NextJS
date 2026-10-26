import { DESTINATION } from '@/lib/sim/config';
import type { EventBus } from '@/lib/sim/events';
import { fetchRoute } from '@/lib/sim/routing/osrm';
import { Dispatcher, type Quote } from '@/lib/sim/dispatch';
import { polylineToCells, toCell } from '@/lib/sim/grid';
import type { World } from '@/lib/sim/world';
import type { Category, Place, Ride, Route } from '@/lib/sim/types';

/** What the phone can ask the simulation to do. */
export class App {
  readonly dispatcher: Dispatcher;
  pickup: Place | null = null;
  route: Route | null = null;

  constructor(
    readonly world: World,
    readonly bus: EventBus
  ) {
    this.dispatcher = new Dispatcher(world, bus);
  }

  async selectPickup(place: Place): Promise<Route> {
    this.pickup = place;
    this.route = null;
    this.bus.emit({ type: 'pickup_selected', place, cell: toCell(place) });
    const route = await fetchRoute(place, DESTINATION);
    if (this.pickup !== place) return route;
    this.route = route;
    this.bus.emit({
      type: 'trip_previewed',
      place,
      route,
      cells: polylineToCells(route.points)
    });
    return route;
  }

  quotes(): Quote[] {
    return this.pickup && this.route
      ? this.dispatcher.quote(this.pickup, this.route)
      : [];
  }

  request(category: Category): Ride {
    return this.dispatcher.request(this.pickup!, category, this.route!);
  }

  cancel(): void {
    this.dispatcher.cancel();
  }

  backToPickup(): void {
    this.pickup = null;
    this.route = null;
    this.bus.emit({ type: 'preview_cleared' });
  }

  reset(): void {
    this.pickup = null;
    this.route = null;
    this.dispatcher.ride = null;
    this.bus.emit({ type: 'reset' });
  }
}
