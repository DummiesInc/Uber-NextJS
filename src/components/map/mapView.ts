import L from 'leaflet';
import { cellToBoundary, latLngToCell } from 'h3-js';
import {
  DESTINATION,
  H3_RES,
  MAP_CENTER,
  MAP_ZOOM,
  OFFER_TIMEOUT_MS
} from '@/lib/sim/config';
import type { EventBus } from '@/lib/sim/events';
import type { Driver } from '@/lib/sim/driver';
import { SERVICE_CELLS, SERVICE_SET } from '@/lib/sim/grid';
import type { World } from '@/lib/sim/world';
import type { LatLng, Route } from '@/lib/sim/types';
import {
  BASEMAPS,
  basemapLayer,
  saveBasemap,
  savedBasemap,
  type Basemap
} from '@/components/map/basemaps';
import { RING_C, carIcon, destIcon, personIcon } from '@/components/map/icons';

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];
const hexLatLngs = (cell: string) => cellToBoundary(cell) as L.LatLngTuple[];

interface CarView {
  marker: L.Marker;
  root: HTMLElement;
  body: HTMLElement;
  ringFg: SVGCircleElement;
  timer: HTMLElement;
  stateClass: string;
}

interface ActiveOffer {
  driver: Driver;
  startedAt: number;
}

/** What the hovered H3 cell looks like, reported to React for the overlay. */
export interface CellHoverInfo {
  cell: string;
  driversHere: number;
  occupiedCells: number;
}

/** An open driver popup: React portals its content into `container`. */
export interface DriverPopupTarget {
  driver: Driver;
  container: HTMLElement;
  popup: L.Popup;
}

export interface MapViewCallbacks {
  onCellHover: (info: CellHoverInfo | null) => void;
  onDriverPopupOpen: (target: DriverPopupTarget) => void;
  onDriverPopupClose: (driver: Driver) => void;
}

// Leaflet overlay path styles. Leaflet writes fill-opacity / stroke-opacity
// presentation attributes, so opacities and dash patterns are SVG geometry
// with no design token: arbitrary properties by design.
const HEX_CLASS = {
  pickup:
    'pickup-hex fill-surface-primary [fill-opacity:.25] stroke-gray-90 stroke-3 in-[.theme-dark]:[fill-opacity:.15] in-[.theme-dark]:stroke-gray-5',
  ringCurrent:
    'ring-current fill-surface-accent [fill-opacity:.35] stroke-stroke-accent stroke-2',
  ringHit:
    'ring-hit fill-surface-success [fill-opacity:.35] stroke-stroke-success stroke-2',
  ringOld:
    'ring-old fill-surface-accent [fill-opacity:.1] stroke-stroke-accent [stroke-opacity:.4] stroke-1',
  hover: 'hover-hex fill-blue-40 [fill-opacity:.12] stroke-blue-60 stroke-2',
  route:
    'route-hex fill-blue-50 [fill-opacity:.1] stroke-blue-60 [stroke-opacity:.5] stroke-1 in-[.theme-dark]:fill-blue-40 in-[.theme-dark]:stroke-blue-40'
};
const LINE_CLASS = {
  tripCasing:
    'trip-casing stroke-surface-primary stroke-9 in-[.theme-dark]:stroke-gray-90',
  tripRoute:
    'trip-route stroke-gray-90 stroke-5 in-[.theme-dark]:stroke-gray-10',
  pickupRoute: 'pickup-route stroke-blue-50 stroke-5 [stroke-dasharray:2_9]',
  offer:
    'offer-line stroke-yellow-40 stroke-3 [stroke-dasharray:6_6] animate-dash'
};

/** Canvas strokes can't read CSS variables, so resolve a gray token to hsl(). */
const grayToken = (step: number): string =>
  `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--gray-${step}`).trim()})`;

export class MapView {
  readonly map: L.Map;
  private renderer = L.canvas({ padding: 0.3 });
  private cars = new Map<number, CarView>();
  private ringLayer = L.layerGroup();
  private routeLayer = L.layerGroup();
  private pickupLayer = L.layerGroup();
  private hoverHex: L.Polygon | null = null;
  private offerLine: L.Polyline | null = null;
  private person: L.Marker;
  private dest: L.Marker;
  private offer: ActiveOffer | null = null;
  private riderDriverId: number | null = null;
  private pickup: LatLng | null = null;
  private currentRing: L.Polygon[] = [];
  private gridPolys: L.Polygon[] = [];
  private hoveredCell: CellHoverInfo | null = null;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribers: (() => void)[] = [];

  constructor(
    el: HTMLElement,
    private world: World,
    bus: EventBus,
    private callbacks: MapViewCallbacks
  ) {
    this.map = L.map(el, { zoomControl: true, preferCanvas: false }).setView(
      ll(MAP_CENTER),
      MAP_ZOOM
    );
    this.drawGrid();
    this.setupBasemaps();
    this.ringLayer.addTo(this.map);
    this.routeLayer.addTo(this.map);
    this.pickupLayer.addTo(this.map);

    this.dest = L.marker(ll(DESTINATION), { icon: destIcon, zIndexOffset: 900 })
      .bindTooltip(`<b>${DESTINATION.name}</b><br>${DESTINATION.address}`, {
        direction: 'top',
        offset: [8, -28]
      })
      .addTo(this.map);
    this.person = L.marker(ll(MAP_CENTER), {
      icon: personIcon,
      zIndexOffset: 1000
    });

    this.syncFleet();
    this.unsubscribers.push(world.onFleetChange(() => this.syncFleet()));
    this.map.on('mousemove', (e: L.LeafletMouseEvent) =>
      this.showCellInfo(e.latlng)
    );
    this.map.on('mouseout', () => {
      this.hoverHex?.remove();
      this.reportCellHover(null);
    });

    this.unsubscribers.push(
      bus.on((e) => {
        switch (e.type) {
          case 'pickup_selected':
            this.clearRide();
            this.pickup = e.place;
            this.person.setLatLng(ll(e.place)).addTo(this.map);
            L.polygon(hexLatLngs(e.cell), {
              className: HEX_CLASS.pickup,
              interactive: false
            }).addTo(this.pickupLayer);
            this.map.flyTo(ll(e.place), 14, { duration: 0.8 });
            break;
          case 'trip_previewed':
            this.drawTrip(e.route, e.cells);
            break;
          case 'ride_requested':
            this.ringLayer.clearLayers();
            this.currentRing = [];
            this.map.flyTo(ll(e.ride.pickup), 13, { duration: 0.8 });
            break;
          case 'ring_searched':
            this.currentRing.forEach((p) =>
              p.getElement()?.setAttribute('class', HEX_CLASS.ringOld)
            );
            this.currentRing = e.cells.map((c) =>
              L.polygon(hexLatLngs(c), {
                className: e.found ? HEX_CLASS.ringHit : HEX_CLASS.ringCurrent,
                interactive: false
              }).addTo(this.ringLayer)
            );
            break;
          case 'offer_sent':
            this.offer = { driver: e.driver, startedAt: e.startedAt };
            this.offerLine = L.polyline([ll(e.driver.pos), ll(e.ride.pickup)], {
              className: LINE_CLASS.offer
            }).addTo(this.map);
            break;
          case 'offer_result':
            this.endOffer(e.driver, e.outcome === 'accepted');
            if (e.outcome === 'accepted')
              this.later(() => this.ringLayer.clearLayers(), 1500);
            break;
          case 'driver_assigned':
            this.riderDriverId = e.driver.id;
            L.polyline(e.route.points.map(ll), {
              className: LINE_CLASS.pickupRoute
            }).addTo(this.pickupLayer);
            this.map.flyToBounds(
              L.latLngBounds([ll(e.driver.pos), ll(e.ride.pickup)]).pad(0.4),
              { duration: 0.8 }
            );
            break;
          case 'picked_up':
            this.pickupLayer.clearLayers();
            this.person.remove();
            this.cars.get(e.driver.id)?.root.classList.add('has-rider');
            this.map.flyToBounds(
              L.latLngBounds(e.ride.route.points.map(ll)).pad(0.15),
              { duration: 0.8 }
            );
            break;
          case 'dropped_off':
            this.cars.get(e.driver.id)?.root.classList.remove('has-rider');
            this.person.setLatLng(ll(DESTINATION)).addTo(this.map);
            this.riderDriverId = null;
            this.dest
              .setTooltipContent(`<b>Arrived!</b><br>${DESTINATION.address}`)
              .openTooltip();
            break;
          case 'ride_cancelled':
            if (this.offer) this.endOffer(this.offer.driver, false);
            this.ringLayer.clearLayers();
            this.riderDriverId = null;
            this.pickupLayer.clearLayers();
            if (this.pickup)
              this.person.setLatLng(ll(this.pickup)).addTo(this.map);
            break;
          case 'preview_cleared':
          case 'reset':
            this.clearRide();
            this.person.remove();
            this.pickup = null;
            this.dest
              .setTooltipContent(
                `<b>${DESTINATION.name}</b><br>${DESTINATION.address}`
              )
              .closeTooltip();
            if (e.type === 'reset')
              this.map.flyTo(ll(MAP_CENTER), MAP_ZOOM, { duration: 0.8 });
            break;
        }
      })
    );
  }

  /** Detach from the bus and fleet, cancel pending timers and tear down Leaflet. */
  destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.timeouts.forEach((id) => clearTimeout(id));
    this.timeouts.clear();
    this.map.remove();
    this.cars.clear();
  }

  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
  }

  /** Called every animation frame. */
  frame(now: number): void {
    for (const d of this.world.drivers.values()) {
      const view = this.cars.get(d.id);
      if (!view) continue;
      view.marker.setLatLng(ll(d.pos));
      view.body.style.transform = `rotate(${d.heading}deg)`;
      const cls = `car state-${d.state}${d.brain === 'llm' ? ' llm' : ''}${d.id === this.riderDriverId ? ' mine' : ''}`;
      if (cls !== view.stateClass) {
        const keep = ['has-rider', 'flash-yes', 'flash-no'].filter((c) =>
          view.root.classList.contains(c)
        );
        view.root.className = [cls, ...keep].join(' ');
        view.stateClass = cls;
        view.marker.setZIndexOffset(d.state === 'idle' ? 0 : 500);
      }
    }
    if (this.offer) {
      const { driver, startedAt } = this.offer;
      const view = this.cars.get(driver.id);
      const left = Math.max(0, OFFER_TIMEOUT_MS - (now - startedAt));
      if (view) {
        view.ringFg.style.strokeDashoffset = String(
          RING_C * (1 - left / OFFER_TIMEOUT_MS)
        );
        view.timer.textContent = String(Math.ceil(left / 1000));
      }
      if (this.offerLine && this.pickup)
        this.offerLine.setLatLngs([ll(driver.pos), ll(this.pickup)]);
    }
  }

  private endOffer(driver: Driver, accepted: boolean): void {
    if (this.offer?.driver !== driver) return;
    this.offer = null;
    this.offerLine?.remove();
    this.offerLine = null;
    const view = this.cars.get(driver.id);
    if (!view) return;
    const cls = accepted ? 'flash-yes' : 'flash-no';
    view.timer.textContent = accepted ? '✓' : '✗';
    view.root.classList.add(cls);
    this.later(() => {
      view.root.classList.remove(cls);
      view.timer.textContent = '';
      view.ringFg.style.strokeDashoffset = '0';
    }, 1200);
  }

  private drawGrid(): void {
    for (const cell of SERVICE_CELLS) {
      this.gridPolys.push(
        L.polygon(hexLatLngs(cell), {
          renderer: this.renderer,
          weight: 0.6,
          fill: false,
          interactive: false
        }).addTo(this.map)
      );
    }
  }

  private setupBasemaps(): void {
    const layers = new Map(BASEMAPS.map((b) => [b, basemapLayer(b)]));
    const apply = (b: Basemap) => {
      this.map.getContainer().classList.toggle('theme-dark', b.dark);
      const style = b.dark
        ? { color: grayToken(30), opacity: 0.22, weight: 0.6 }
        : { color: grayToken(70), opacity: 0.4, weight: 0.8 };
      for (const p of this.gridPolys) p.setStyle(style);
    };
    const initial = savedBasemap();
    layers.get(initial)!.addTo(this.map);
    apply(initial);
    L.control
      .layers(
        Object.fromEntries(BASEMAPS.map((b) => [b.name, layers.get(b)!])),
        undefined,
        { position: 'topright' }
      )
      .addTo(this.map)
      .getContainer()
      ?.classList.add('text-fluid-s');
    this.map.on('baselayerchange', (e: L.LayersControlEvent) => {
      const b = BASEMAPS.find((x) => x.name === e.name)!;
      apply(b);
      saveBasemap(b);
    });
  }

  private drawTrip(route: Route, cells: string[]): void {
    this.routeLayer.clearLayers();
    for (const c of cells) {
      L.polygon(hexLatLngs(c), {
        className: HEX_CLASS.route,
        interactive: false
      }).addTo(this.routeLayer);
    }
    L.polyline(route.points.map(ll), {
      className: LINE_CLASS.tripCasing,
      interactive: false
    }).addTo(this.routeLayer);
    const line = L.polyline(route.points.map(ll), {
      className: LINE_CLASS.tripRoute,
      interactive: false
    }).addTo(this.routeLayer);
    const mins = Math.round(route.durationS / 60);
    const arrive = new Date(
      Date.now() + route.durationS * 1000
    ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const mid = route.points[Math.floor(route.points.length / 2)];
    L.marker(ll(mid), {
      interactive: false,
      icon: L.divIcon({
        className: 'eta-label',
        iconSize: [0, 0],
        // no token for the 130% lift above the route midpoint; arbitrary by design
        html: `<div class="absolute -translate-x-1/2 -translate-y-[130%] rounded-md bg-gray-90 px-fixed-2xs py-1.5 font-inter text-fluid-s whitespace-nowrap text-fg-alternate shadow-lg"><b>${mins} min</b> · ${(route.distanceM / 1000).toFixed(1)} km<small class="block text-fluid-xs text-gray-20">arrive ~${arrive}</small></div>`
      })
    }).addTo(this.routeLayer);
    this.map.flyToBounds(line.getBounds().pad(0.15), { duration: 0.9 });
  }

  private clearRide(): void {
    if (this.offer) this.endOffer(this.offer.driver, false);
    this.ringLayer.clearLayers();
    this.routeLayer.clearLayers();
    this.pickupLayer.clearLayers();
    this.riderDriverId = null;
  }

  private syncFleet(): void {
    for (const [id, view] of this.cars) {
      if (!this.world.drivers.has(id)) {
        view.marker.remove();
        this.cars.delete(id);
      }
    }
    for (const d of this.world.drivers.values()) {
      if (this.cars.has(d.id)) continue;
      const marker = L.marker(ll(d.pos), {
        icon: carIcon(d),
        riseOnHover: true
      }).addTo(this.map);
      // One persistent container per car; React portals DriverPopup into it.
      const container = document.createElement('div');
      container.className = 'driver-popup min-w-56 font-inter text-fluid-s';
      marker.bindPopup(container, { offset: [0, -12] });
      marker.on('popupopen', (e: L.PopupEvent) =>
        this.callbacks.onDriverPopupOpen({
          driver: d,
          container,
          popup: e.popup
        })
      );
      marker.on('popupclose', () => this.callbacks.onDriverPopupClose(d));
      const root = marker.getElement()!.querySelector<HTMLElement>('.car')!;
      this.cars.set(d.id, {
        marker,
        root,
        body: root.querySelector('.car-body')!,
        ringFg: root.querySelector('.ring-fg')!,
        timer: root.querySelector('.timer')!,
        stateClass: ''
      });
    }
  }

  private showCellInfo(p: L.LatLng): void {
    const cell = latLngToCell(p.lat, p.lng, H3_RES);
    if (!SERVICE_SET.has(cell)) {
      this.hoverHex?.remove();
      this.reportCellHover(null);
      return;
    }
    this.reportCellHover({
      cell,
      driversHere: this.world.index.byCell.get(cell)?.size ?? 0,
      occupiedCells: this.world.index.occupiedCellCount
    });
    if (!this.hoverHex) {
      this.hoverHex = L.polygon(hexLatLngs(cell), {
        className: HEX_CLASS.hover,
        interactive: false
      });
    } else {
      this.hoverHex.setLatLngs(hexLatLngs(cell));
    }
    this.hoverHex.addTo(this.map);
  }

  /** Only notifies React when what the overlay shows actually changed. */
  private reportCellHover(info: CellHoverInfo | null): void {
    const prev = this.hoveredCell;
    if (
      prev === info ||
      (prev &&
        info &&
        prev.cell === info.cell &&
        prev.driversHere === info.driversHere &&
        prev.occupiedCells === info.occupiedCells)
    ) {
      return;
    }
    this.hoveredCell = info;
    this.callbacks.onCellHover(info);
  }
}
