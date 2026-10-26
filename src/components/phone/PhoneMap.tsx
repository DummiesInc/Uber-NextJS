'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { DESTINATION } from '@/lib/sim/config';
import { LOCATIONS } from '@/lib/sim/data/locations';
import type { Driver } from '@/lib/sim/driver';
import type { SimEvent } from '@/lib/sim/events';
import type { LatLng } from '@/lib/sim/types';
import {
  BASEMAPS,
  basemapLayer,
  type Basemap
} from '@/components/map/basemaps';
import { carIcon, destIcon, personIcon } from '@/components/map/icons';
import { useSimulation } from '@/components/providers/SimulationProvider';

const ll = (point: LatLng): L.LatLngTuple => [point.lat, point.lng];

/** The phone's own small Leaflet map, driven entirely by bus events. */
export default function PhoneMap() {
  const { app, bus, registerFrame } = useSimulation();
  const mapElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mapEl: HTMLDivElement | null = mapElRef.current;
    if (!mapEl) return;

    const map: L.Map = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false
    }).setView(ll(DESTINATION), 11);
    const positron: Basemap =
      BASEMAPS.find((basemap) => basemap.name === 'Positron') ?? BASEMAPS[0];
    basemapLayer(positron).addTo(map);
    const person: L.Marker = L.marker([0, 0], { icon: personIcon });
    const dest: L.Marker = L.marker(ll(DESTINATION), { icon: destIcon });
    const routeLine: L.Polyline = L.polyline([], {
      className: 'phone-route stroke-fg-primary stroke-4'
    });
    const pickupLine: L.Polyline = L.polyline([], {
      // SVG dash pattern has no token; arbitrary by design
      className:
        'phone-pickup-route stroke-blue-50 stroke-4 [stroke-dasharray:2_7]'
    });
    let car: L.Marker | null = null;
    let carDriver: Driver | null = null;
    dest.addTo(map);
    routeLine.addTo(map);
    pickupLine.addTo(map);

    const fitAll = (animate: boolean = true) => {
      const points: L.LatLngTuple[] = [ll(DESTINATION)];
      if (app.pickup) points.push(ll(app.pickup));
      else points.push(...LOCATIONS.map(ll));
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(points).pad(0.2), { animate });
    };

    const removeCar = () => {
      car?.remove();
      car = null;
      carDriver = null;
    };

    const clearMap = () => {
      person.remove();
      routeLine.setLatLngs([]);
      pickupLine.setLatLngs([]);
      removeCar();
      fitAll();
    };

    // No zoom animation on mount: StrictMode removes the map straight away, and
    // Leaflet's zoom-end timer would then fire on a removed map.
    fitAll(false);

    const unsubscribeBus = bus.on((event: SimEvent) => {
      switch (event.type) {
        case 'pickup_selected':
          person.setLatLng(ll(event.place)).addTo(map);
          break;
        case 'trip_previewed':
          routeLine.setLatLngs(event.route.points.map(ll));
          fitAll();
          break;
        case 'preview_cleared':
        case 'reset':
          clearMap();
          break;
        case 'ride_cancelled':
          removeCar();
          pickupLine.setLatLngs([]);
          if (app.pickup) person.setLatLng(ll(app.pickup)).addTo(map);
          fitAll();
          break;
        case 'driver_assigned':
          pickupLine.setLatLngs(event.route.points.map(ll));
          removeCar();
          carDriver = event.driver;
          car = L.marker(ll(event.driver.pos), {
            icon: carIcon(event.driver)
          }).addTo(map);
          car
            .getElement()
            ?.querySelector('.car')
            ?.classList.add('state-toPickup');
          map.fitBounds(
            L.latLngBounds([ll(event.driver.pos), ll(event.ride.pickup)]).pad(
              0.3
            )
          );
          break;
        case 'picked_up':
          person.remove();
          pickupLine.setLatLngs([]);
          car
            ?.getElement()
            ?.querySelector('.car')
            ?.classList.replace('state-toPickup', 'state-onTrip');
          fitAll();
          break;
        case 'dropped_off':
          removeCar();
          person.setLatLng(ll(DESTINATION)).addTo(map);
          break;
      }
    });

    const unregisterFrame = registerFrame(() => {
      if (!car || !carDriver) return;
      car.setLatLng(ll(carDriver.pos));
      const carBody: HTMLElement | null | undefined = car
        .getElement()
        ?.querySelector<HTMLElement>('.car-body');
      if (carBody) carBody.style.transform = `rotate(${carDriver.heading}deg)`;
    });

    return () => {
      unsubscribeBus();
      unregisterFrame();
      map.remove();
    };
  }, [app, bus, registerFrame]);

  return <div ref={mapElRef} className="phone-map shrink-0 basis-[34%]" />;
}
