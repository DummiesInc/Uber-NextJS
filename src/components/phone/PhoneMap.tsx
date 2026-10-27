'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import If from '@/lib/If';
import { DESTINATION, MAP_CENTER } from '@/lib/sim/config';
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

const PIN_START_ZOOM: number = 14;

interface PhoneMapProps {
  isPinMode: boolean;
  onPinCenterChange: (center: LatLng) => void;
}

/** The phone's own Leaflet map, driven by bus events; grows in pin mode so the rider can aim. */
export default function PhoneMap({
  isPinMode,
  onPinCenterChange
}: PhoneMapProps) {
  const { app, bus, registerFrame } = useSimulation();
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fitAllRef = useRef<((animate?: boolean) => void) | null>(null);
  const isPinModeRef = useRef<boolean>(isPinMode);
  const onPinCenterChangeRef =
    useRef<(center: LatLng) => void>(onPinCenterChange);

  useEffect(() => {
    onPinCenterChangeRef.current = onPinCenterChange;
  });

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

    // Bus-driven fits never move the map while the rider is aiming the pin.
    const fitAll = (animate: boolean = true) => {
      if (isPinModeRef.current) return;
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
    mapRef.current = map;
    fitAllRef.current = fitAll;

    map.on('moveend', () => {
      if (!isPinModeRef.current) return;
      const center: L.LatLng = map.getCenter();
      onPinCenterChangeRef.current({ lat: center.lat, lng: center.lng });
    });

    // Keeps Leaflet in sync when the container grows/shrinks with pin mode.
    const resizeObserver: ResizeObserver = new ResizeObserver(() =>
      map.invalidateSize()
    );
    resizeObserver.observe(mapEl);

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
      resizeObserver.disconnect();
      unsubscribeBus();
      unregisterFrame();
      mapRef.current = null;
      fitAllRef.current = null;
      map.remove();
    };
  }, [app, bus, registerFrame]);

  // Runs after the layout change commits, so invalidateSize sees the new size.
  // Views are set without animation so a StrictMode remount can't hit a mid-zoom map.
  useEffect(() => {
    isPinModeRef.current = isPinMode;
    const map: L.Map | null = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    if (isPinMode)
      map.setView(ll(MAP_CENTER), PIN_START_ZOOM, { animate: false });
    else fitAllRef.current?.(false);
  }, [isPinMode]);

  return (
    <div
      className={cn(
        'phone-map-wrap relative shrink-0 basis-[34%]',
        isPinMode && 'min-h-0 flex-1 basis-auto'
      )}
    >
      <div ref={mapElRef} className="phone-map absolute inset-0" />
      <If condition={isPinMode}>
        <div className="pin-overlay pointer-events-none absolute inset-0 z-[700]">
          {/* Ground dot: marks the exact map center that becomes the pickup. */}
          <span className="pin-overlay-dot absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-surface-alternate ring-2 ring-surface-primary/80" />
          {/* Bottom edge on the center, nudged down 1/24 so the stroked tip
              (y≈23 of lucide's 24-unit box) lands on it; lifts while dragging. */}
          <MapPin
            className="pin-overlay-icon absolute bottom-1/2 left-1/2 size-9 -translate-x-1/2 translate-y-1/24 fill-surface-alternate text-fg-alternate drop-shadow-md transition-transform duration-150 ease-out in-[.leaflet-dragging]:-translate-y-1/4"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
      </If>
    </div>
  );
}
