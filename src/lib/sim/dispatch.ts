import { gridDiskDistances, gridDistance } from 'h3-js';
import {
  CATEGORIES,
  MAX_K,
  OFFER_TIMEOUT_MS,
  RETRY_MS,
  RING_STEP_MS
} from '@/lib/sim/config';
import { decide } from '@/lib/sim/drivers/llmBrain';
import type { EventBus, OfferOutcome } from '@/lib/sim/events';
import { haversine } from '@/lib/sim/geo';
import { fetchRoute } from '@/lib/sim/routing/osrm';
import {
  CATEGORY_LIST,
  type Category,
  type Decision,
  type Offer,
  type Place,
  type Ride,
  type Route
} from '@/lib/sim/types';
import type { Driver } from '@/lib/sim/driver';
import { toCell } from '@/lib/sim/grid';
import { fareFor } from '@/lib/sim/pricing';
import type { World } from '@/lib/sim/world';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Quote {
  category: Category;
  fare: number;
  /** Estimated pickup time in real-world minutes, or null when no car is in range. */
  etaMin: number | null;
}

export class Dispatcher {
  ride: Ride | null = null;
  private nextRideId = 1;
  /** Driver currently holding the exclusive offer, if any. */
  private offered: { ride: Ride; driver: Driver } | null = null;

  constructor(
    private world: World,
    private bus: EventBus
  ) {}

  /** Price and pickup ETA for every category, using a silent ring search (no offers). */
  quote(pickup: Place, route: Route): Quote[] {
    const cell = toCell(pickup);
    const rings = gridDiskDistances(cell, MAX_K);
    return CATEGORY_LIST.map((category) => {
      const hit = this.closestInRings(
        rings,
        (d) => d.state === 'idle' && d.category === category,
        pickup
      );
      let etaMin: number | null = null;
      if (hit) {
        const roadM = haversine(hit.pos, pickup) * 1.35;
        etaMin = Math.max(
          2,
          Math.round((roadM / 10 / 60 + 1) * CATEGORIES[category].pickupFactor)
        );
      }
      return { category, fare: fareFor(category, route), etaMin };
    });
  }

  request(pickup: Place, category: Category, route: Route): Ride {
    const ride: Ride = {
      id: this.nextRideId++,
      pickup,
      pickupCell: toCell(pickup),
      category,
      fare: fareFor(category, route),
      route,
      status: 'searching',
      declinedBy: new Set(),
      driverId: null,
      requestedAt: performance.now()
    };
    this.ride = ride;
    this.bus.emit({ type: 'ride_requested', ride });
    void this.run(ride);
    return ride;
  }

  cancel(): void {
    const ride = this.ride;
    if (!ride || ride.status === 'completed' || ride.status === 'cancelled')
      return;
    const prev = ride.status;
    ride.status = 'cancelled';
    if (this.offered?.ride === ride) {
      this.offered.driver.state = 'idle';
      this.offered = null;
    }
    if (prev !== 'searching' && ride.driverId !== null) {
      const d = this.world.drivers.get(ride.driverId);
      if (d) {
        d.stop();
        d.state = 'idle';
      }
    }
    this.bus.emit({ type: 'ride_cancelled', ride });
  }

  private closestInRings(
    rings: string[][],
    ok: (d: Driver) => boolean,
    origin: Place
  ): Driver | null {
    for (const ring of rings) {
      const found = this.candidatesIn(ring, ok);
      if (found.length) return this.closest(found, origin);
    }
    return null;
  }

  /** The only place drivers are looked up: by cell, through the location index. */
  private candidatesIn(cells: string[], ok: (d: Driver) => boolean): Driver[] {
    return this.world.index
      .driversInCells(cells)
      .map((id) => this.world.drivers.get(id))
      .filter((d): d is Driver => !!d && ok(d));
  }

  private closest(ds: Driver[], origin: Place): Driver {
    return ds.reduce((a, b) =>
      haversine(b.pos, origin) < haversine(a.pos, origin) ? b : a
    );
  }

  /** Walk outward ring by ring (k = 0, 1, 2 …) until a free driver of the right category shows up. */
  private async searchRings(
    ride: Ride
  ): Promise<{ driver: Driver; k: number } | null> {
    const rings = gridDiskDistances(ride.pickupCell, MAX_K);
    const ok = (d: Driver) =>
      d.state === 'idle' &&
      d.category === ride.category &&
      !ride.declinedBy.has(d.id);
    for (let k = 0; k < rings.length; k++) {
      if (ride.status !== 'searching') return null;
      const found = this.candidatesIn(rings[k], ok);
      this.bus.emit({
        type: 'ring_searched',
        ride,
        k,
        cells: rings[k],
        found: found.length
      });
      if (found.length) return { driver: this.closest(found, ride.pickup), k };
      await sleep(RING_STEP_MS);
    }
    return null;
  }

  private async run(ride: Ride): Promise<void> {
    while (ride.status === 'searching') {
      const hit = await this.searchRings(ride);
      if (ride.status !== 'searching') return;
      if (!hit) {
        this.bus.emit({ type: 'no_drivers', ride, category: ride.category });
        await sleep(RETRY_MS);
        // Everyone in range already passed — let them see it again.
        ride.declinedBy.clear();
        continue;
      }

      // Exclusive offer: the driver is locked while this request waits on them.
      const { driver, k } = hit;
      driver.state = 'offered';
      this.offered = { ride, driver };
      const startedAt = performance.now();
      this.bus.emit({
        type: 'offer_sent',
        ride,
        driver,
        k,
        startedAt,
        deadline: startedAt + OFFER_TIMEOUT_MS
      });

      const result = await Promise.race<Decision | 'timeout'>([
        decide(this.offerFor(ride, driver), driver),
        sleep(OFFER_TIMEOUT_MS).then(() => 'timeout' as const)
      ]);
      const afterMs = performance.now() - startedAt;
      if (ride.status !== 'searching') return; // cancel() already released the driver
      this.offered = null;
      if (result !== 'timeout' && result.accept) {
        this.bus.emit({
          type: 'offer_result',
          ride,
          driver,
          outcome: 'accepted',
          reason: result.reason,
          afterMs
        });
        await this.assign(ride, driver);
        return;
      }
      driver.state = 'idle';
      ride.declinedBy.add(driver.id);
      const outcome: OfferOutcome =
        result === 'timeout' ? 'timeout' : 'declined';
      const reason =
        result === 'timeout' ? "Didn't respond in 15 seconds." : result.reason;
      this.bus.emit({
        type: 'offer_result',
        ride,
        driver,
        outcome,
        reason,
        afterMs
      });
      await sleep(1_200);
    }
  }

  private offerFor(ride: Ride, driver: Driver): Offer {
    return {
      rideId: ride.id,
      category: ride.category,
      pickupName: ride.pickup.name,
      pickupCells: gridDistance(driver.cell, ride.pickupCell),
      pickupKm: (haversine(driver.pos, ride.pickup) * 1.35) / 1000,
      tripKm: ride.route.distanceM / 1000,
      tripMin: ride.route.durationS / 60,
      fare: ride.fare
    };
  }

  private async assign(ride: Ride, driver: Driver): Promise<void> {
    driver.state = 'toPickup';
    driver.stop();
    ride.driverId = driver.id;
    ride.status = 'driverEnRoute';
    const route = await fetchRoute(driver.pos, ride.pickup);
    if (ride.status !== 'driverEnRoute') return;
    driver.follow(route.points, route.durationS, this.world.simTime, () =>
      this.arrived(ride, driver)
    );
    this.bus.emit({ type: 'driver_assigned', ride, driver, route });
  }

  private async arrived(ride: Ride, driver: Driver): Promise<void> {
    if (ride.status !== 'driverEnRoute') return;
    ride.status = 'driverArrived';
    this.bus.emit({ type: 'driver_arrived', ride, driver });
    await sleep(2_500);
    if (ride.status !== 'driverArrived') return;
    ride.status = 'onTrip';
    driver.state = 'onTrip';
    this.bus.emit({ type: 'picked_up', ride, driver });
    driver.follow(
      ride.route.points,
      ride.route.durationS,
      this.world.simTime,
      () => this.droppedOff(ride, driver)
    );
  }

  private droppedOff(ride: Ride, driver: Driver): void {
    ride.status = 'completed';
    driver.state = 'idle';
    driver.trips++;
    driver.earnings += ride.fare * 0.75;
    this.bus.emit({ type: 'dropped_off', ride, driver });
  }
}
