import L from 'leaflet';
import {
  cellToBoundary,
  cellToChildren,
  cellToParent,
  cellsToMultiPolygon,
  gridDisk,
  latLngToCell
} from 'h3-js';
import {
  DESTINATION,
  H3_RES,
  MAP_CENTER,
  MAP_ZOOM,
  OFFER_TIMEOUT_MS,
  REQUEST_FLY_MS
} from '@/lib/sim/config';
import type { EventBus } from '@/lib/sim/events';
import type { Driver } from '@/lib/sim/driver';
import {
  HEAT_LEVELS,
  HEAT_RES,
  cellsAtLevel,
  toHeatCell,
  type HeatLevel
} from '@/lib/sim/heat';
import type { World } from '@/lib/sim/world';
import type { LatLng, Route } from '@/lib/sim/types';
import {
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

/** One step of a hovered cell's ancestry, coarse to fine. */
export interface CellBreadcrumb {
  res: HeatLevel;
  cell: string;
}

/** What the hovered H3 cell looks like, reported to React for the overlay. */
export interface CellHoverInfo {
  cell: string;
  res: HeatLevel;
  /** The next-coarser shown level's cell, or null at res 7. */
  parent: string | null;
  /** How many next-finer cells with service area lie under it (0 at res 9). */
  children: number;
  /** Total demand under the cell (sum of its res-9 values). */
  demand: number;
  /** Demand relative to the busiest cell at this level, 0–1. */
  share: number;
  /** res 7 down to this cell. */
  breadcrumb: CellBreadcrumb[];
  driversHere: number;
  occupiedCells: number;
}

export const AUTO_LEVEL_MODE = 'auto' as const;
/** 'auto' picks the level from the zoom; a HeatLevel pins the map to it. */
export type LevelMode = HeatLevel | typeof AUTO_LEVEL_MODE;

/** Auto mode shows the first level whose `maxZoom` covers the zoom, else res 9. */
export const AUTO_LEVEL_MAX_ZOOM: { level: HeatLevel; maxZoom: number }[] = [
  { level: 7, maxZoom: 11 },
  { level: 8, maxZoom: 13 }
];

const levelForZoom = (zoom: number): HeatLevel =>
  AUTO_LEVEL_MAX_ZOOM.find(({ maxZoom }) => zoom <= maxZoom)?.level ?? HEAT_RES;

const parentLevel = (res: HeatLevel): HeatLevel | null =>
  res === HEAT_LEVELS[0] ? null : ((res - 1) as HeatLevel);

const childLevel = (res: HeatLevel): HeatLevel | null =>
  res === HEAT_RES ? null : ((res + 1) as HeatLevel);

/** Every cell with service area under it, per level, for hover hit tests. */
const LEVEL_CELL_SETS = new Map<HeatLevel, Set<string>>(
  HEAT_LEVELS.map((res: HeatLevel) => [res, new Set(cellsAtLevel(res))])
);

/** A res-7 brush of 2+ rings covers most of the city, so cap it. */
const MAX_RES7_BRUSH_RINGS: number = 1;

/** Each level draws into its own three panes so a level fades as one. */
enum LevelPaneKind {
  Outline = 'outline',
  Heat = 'heat',
  Parent = 'parent'
}

// Unlayered leaflet.css outranks Tailwind's z-* utilities, so set it inline.
// Basemap (200) < outline (300) < heat (350) < parent (360) < overlays (400).
const LEVEL_PANE_Z: Record<LevelPaneKind, string> = {
  [LevelPaneKind.Outline]: '300',
  [LevelPaneKind.Heat]: '350',
  [LevelPaneKind.Parent]: '360'
};

const levelPaneName = (kind: LevelPaneKind, res: HeatLevel): string =>
  `${kind}-${res}`;

/**
 * Crossfade between levels: every level pane carries `base`, plus `shown`
 * or `hidden`. Both run at once; the incoming level eases out (fast start)
 * while the outgoing one eases in (lingers), so the new cells grow out of
 * the old ones. LEVEL_FADE_MS must match the duration class.
 */
const LEVEL_PANE_CLASS = {
  base: 'level-pane transition-opacity duration-350',
  shown: 'opacity-100 ease-out',
  hidden: 'opacity-0 pointer-events-none ease-in'
};
const LEVEL_FADE_MS: number = 350;

/** One level's canvas layers, built on first show and kept. */
interface LevelLayers {
  heatPolys: Map<string, L.Polygon>;
  heat: L.LayerGroup;
  outline: L.Polygon;
  parentOutline: L.Polygon | null;
}

/** An open driver popup: React portals its content into `container`. */
export interface DriverPopupTarget {
  driver: Driver;
  container: HTMLElement;
  popup: L.Popup;
}

export enum HeatTool {
  None = 'none',
  Paint = 'paint',
  Erase = 'erase'
}

/**
 * The active heat-map editing tool. `rings` is the brush radius (1–3) in
 * cells of the level on screen, capped at 1 at res 7.
 */
export interface HeatBrush {
  tool: HeatTool;
  rings: number;
  strength: number;
}

export interface MapViewCallbacks {
  onCellHover: (info: CellHoverInfo | null) => void;
  onLevelChange: (level: HeatLevel) => void;
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
  brush:
    'brush-hex fill-none stroke-gray-90 stroke-2 [stroke-dasharray:4_4] in-[.theme-dark]:stroke-gray-5',
  // Hover family, strongest to quietest: parent, hovered cell, children.
  hover:
    'hover-hex fill-blue-40 [fill-opacity:.18] stroke-blue-60 stroke-2 in-[.theme-dark]:[fill-opacity:.22] in-[.theme-dark]:stroke-blue-40',
  hoverParent:
    'hover-parent fill-none stroke-blue-70 stroke-3 in-[.theme-dark]:stroke-blue-30',
  hoverChildren:
    'hover-children fill-none stroke-blue-50 [stroke-opacity:.8] stroke-1 [stroke-dasharray:3_3] in-[.theme-dark]:stroke-blue-40',
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

/** Canvas can't read CSS variables, so resolve a colour token to hsl(). */
const colorToken = (name: string): string =>
  `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()})`;

/**
 * Demand ramp, light yellow (low) through ochre to deep red (high); Legend
 * mirrors it. It skips the orange-30–60 band so on-trip (orange-50) cars only
 * ever sit on yellow or on a much darker red.
 */
const HEAT_RAMP_TOKENS: string[] = [
  'yellow-30',
  'yellow-50',
  'yellow-60',
  'orange-70',
  'orange-90'
];
let heatRampColors: string[] = [];

interface HeatOpacity {
  base: number;
  range: number;
}

/**
 * fillOpacity = base + range * sqrt(value), per level and basemap theme. The
 * square root lifts the faint background and light dabs so they read; big
 * res-7 cells wash over whole neighbourhoods, so they start lowest, and
 * small res-9 cells start highest so they stay visible. Dark basemaps make
 * the same colours glow, so they start lower still.
 */
const HEAT_OPACITY: Record<HeatLevel, Record<'light' | 'dark', HeatOpacity>> = {
  7: { light: { base: 0.1, range: 0.5 }, dark: { base: 0.06, range: 0.52 } },
  8: { light: { base: 0.14, range: 0.52 }, dark: { base: 0.08, range: 0.56 } },
  9: { light: { base: 0.18, range: 0.54 }, dark: { base: 0.1, range: 0.6 } }
};

interface OutlineTokenStyle {
  color: string;
  opacity: number;
  weight: number;
}

/**
 * Outline hierarchy: the current level's cells are hairlines, the parent
 * level's are ~2.5x heavier and darker so groups of ~7 children read, and
 * the SVG hover family (HEX_CLASS) sits above both. `color` is a colour
 * token; widths are canvas px, so there is no token for them.
 */
const OUTLINE_STYLE: Record<'light' | 'dark', OutlineTokenStyle> = {
  light: { color: 'gray-60', opacity: 0.35, weight: 0.75 },
  dark: { color: 'gray-30', opacity: 0.28, weight: 0.7 }
};

/** Outlines of the next-coarser level, drawn over the heat (no fill). */
const PARENT_OUTLINE_STYLE: Record<'light' | 'dark', OutlineTokenStyle> = {
  light: { color: 'gray-90', opacity: 0.55, weight: 1.75 },
  dark: { color: 'gray-5', opacity: 0.45, weight: 1.5 }
};

const outlinePathOptions = ({
  color,
  opacity,
  weight
}: OutlineTokenStyle): L.PathOptions => ({
  color: colorToken(color),
  opacity,
  weight
});

/**
 * Canvas fill for a cell's demand share (HeatMap.intensity) in 0–1; zero is
 * fully transparent.
 */
function heatStyle(
  value: number,
  res: HeatLevel,
  isDark: boolean
): L.PathOptions {
  if (heatRampColors.length === 0) {
    heatRampColors = HEAT_RAMP_TOKENS.map(colorToken);
  }
  if (value <= 0) return { fillOpacity: 0 };
  const step: number = Math.min(
    heatRampColors.length - 1,
    Math.floor(value * heatRampColors.length)
  );
  const { base, range }: HeatOpacity =
    HEAT_OPACITY[res][isDark ? 'dark' : 'light'];
  return {
    fillColor: heatRampColors[step],
    fillOpacity: base + range * Math.sqrt(value)
  };
}

/** The god map's imperative Leaflet layer; GodMap owns one per mount. */
export interface MapView {
  readonly map: L.Map;
  destroy: () => void;
  setGridVisible: (isVisible: boolean) => void;
  setHeatVisible: (isVisible: boolean) => void;
  setParentOutlinesVisible: (isVisible: boolean) => void;
  setLevelMode: (mode: LevelMode) => void;
  /** Switch the heat editing tool; any active tool disables map dragging. */
  setHeatBrush: (brush: HeatBrush) => void;
  /** Called every animation frame. */
  frame: (now: number) => void;
  /** Swap the tile layer and restyle the grid and heat for its theme. */
  setBasemap: (basemap: Basemap) => void;
}

export function createMapView(
  el: HTMLElement,
  world: World,
  bus: EventBus,
  callbacks: MapViewCallbacks
): MapView {
  /** Canvas renderer per level pane, keyed by pane name. */
  const renderers = new Map<string, L.Canvas>();
  const levels = new Map<HeatLevel, LevelLayers>();
  let levelMode: LevelMode = AUTO_LEVEL_MODE;
  let level: HeatLevel = levelForZoom(MAP_ZOOM);
  /** Busiest res-9 value at the last restyle; a change restyles every cell. */
  let lastHeatMax: number = -1;
  let outlineStyle: L.PathOptions = {};
  let parentOutlineStyle: L.PathOptions = {};
  /** Mirrors `.theme-dark` on the container; heat opacity depends on it. */
  let isDarkBasemap: boolean = false;
  let heatBrush: HeatBrush = {
    tool: HeatTool.None,
    rings: 1,
    strength: 0.2
  };
  let brushHex: L.Polygon | null = null;
  let brushCell: string | null = null;
  /** Last cell painted in the current stroke, or null when not stroking. */
  let strokeCell: string | null = null;
  let isStroking: boolean = false;
  const cars = new Map<number, CarView>();
  const ringLayer = L.layerGroup();
  const routeLayer = L.layerGroup();
  const pickupLayer = L.layerGroup();
  /** Hovered cell, its parent and its children (SVG, a few shapes). */
  const hoverLayer = L.layerGroup();
  let offerLine: L.Polyline | null = null;
  let offer: ActiveOffer | null = null;
  let riderDriverId: number | null = null;
  let pickup: LatLng | null = null;
  let currentRing: L.Polygon[] = [];
  let currentBasemap: Basemap | null = null;
  let basemapTileLayer: L.Layer | null = null;
  let hoveredCell: CellHoverInfo | null = null;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let unsubscribers: (() => void)[] = [];

  const map: L.Map = L.map(el, {
    zoomControl: false,
    preferCanvas: false
  }).setView(ll(MAP_CENTER), MAP_ZOOM);
  // Top-right keeps the left edge free for the control panel drawer.
  L.control.zoom({ position: 'topright' }).addTo(map);
  for (const res of HEAT_LEVELS) {
    for (const kind of Object.values(LevelPaneKind)) {
      if (kind === LevelPaneKind.Parent && parentLevel(res) === null) {
        continue;
      }
      const name: string = levelPaneName(kind, res);
      const pane: HTMLElement = map.createPane(name);
      pane.style.zIndex = LEVEL_PANE_Z[kind];
      pane.classList.add(
        ...LEVEL_PANE_CLASS.base.split(' '),
        ...LEVEL_PANE_CLASS.hidden.split(' ')
      );
      renderers.set(name, L.canvas({ padding: 0.3, pane: name }));
    }
  }
  unsubscribers.push(
    world.heat.onChange((changed: string[] | null) => restyleHeat(changed))
  );
  setBasemap(savedBasemap());
  showLevel(level);
  callbacks.onLevelChange(level);
  map.on('zoomend', () => updateLevel());
  hoverLayer.addTo(map);
  ringLayer.addTo(map);
  routeLayer.addTo(map);
  pickupLayer.addTo(map);

  const dest: L.Marker = L.marker(ll(DESTINATION), {
    icon: destIcon,
    zIndexOffset: 900
  })
    .bindTooltip(`<b>${DESTINATION.name}</b><br>${DESTINATION.address}`, {
      direction: 'top',
      offset: [8, -28]
    })
    .addTo(map);
  const person: L.Marker = L.marker(ll(MAP_CENTER), {
    icon: personIcon,
    zIndexOffset: 1000
  });

  syncFleet();
  unsubscribers.push(world.onFleetChange(() => syncFleet()));
  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    if (heatBrush.tool === HeatTool.None) {
      showCellInfo(e.latlng);
      return;
    }
    showBrush(e.latlng);
    if (isStroking) paintStroke(e.latlng);
  });
  map.on('mousedown', (e: L.LeafletMouseEvent) => {
    if (heatBrush.tool === HeatTool.None) return;
    isStroking = true;
    strokeCell = null;
    paintStroke(e.latlng);
  });
  map.on('mouseup', () => endStroke());
  map.on('mouseout', () => {
    endStroke();
    hideBrush();
    clearHover();
  });

  unsubscribers.push(
    bus.on((e) => {
      switch (e.type) {
        case 'pickup_selected':
          clearRide();
          pickup = e.place;
          person.setLatLng(ll(e.place)).addTo(map);
          L.polygon(hexLatLngs(e.cell), {
            className: HEX_CLASS.pickup,
            interactive: false
          }).addTo(pickupLayer);
          map.flyTo(ll(e.place), 14, { duration: 0.8 });
          break;
        case 'trip_previewed':
          drawTrip(e.route, e.cells);
          break;
        case 'ride_requested':
          ringLayer.clearLayers();
          currentRing = [];
          map.flyTo(ll(e.ride.pickup), 13, {
            duration: REQUEST_FLY_MS / 1000
          });
          break;
        case 'ring_searched':
          currentRing.forEach((p) =>
            p.getElement()?.setAttribute('class', HEX_CLASS.ringOld)
          );
          currentRing = e.cells.map((c) =>
            L.polygon(hexLatLngs(c), {
              className: e.found ? HEX_CLASS.ringHit : HEX_CLASS.ringCurrent,
              interactive: false
            }).addTo(ringLayer)
          );
          break;
        case 'offer_sent':
          offer = { driver: e.driver, startedAt: e.startedAt };
          offerLine = L.polyline([ll(e.driver.pos), ll(e.ride.pickup)], {
            className: LINE_CLASS.offer
          }).addTo(map);
          break;
        case 'offer_result':
          endOffer(e.driver, e.outcome === 'accepted');
          if (e.outcome === 'accepted')
            later(() => ringLayer.clearLayers(), 1500);
          break;
        case 'driver_assigned':
          riderDriverId = e.driver.id;
          L.polyline(e.route.points.map(ll), {
            className: LINE_CLASS.pickupRoute
          }).addTo(pickupLayer);
          map.flyToBounds(
            L.latLngBounds([ll(e.driver.pos), ll(e.ride.pickup)]).pad(0.4),
            { duration: 0.8 }
          );
          break;
        case 'picked_up':
          pickupLayer.clearLayers();
          person.remove();
          cars.get(e.driver.id)?.root.classList.add('has-rider');
          map.flyToBounds(
            L.latLngBounds(e.ride.route.points.map(ll)).pad(0.15),
            { duration: 0.8 }
          );
          break;
        case 'dropped_off':
          cars.get(e.driver.id)?.root.classList.remove('has-rider');
          person.setLatLng(ll(DESTINATION)).addTo(map);
          riderDriverId = null;
          dest
            .setTooltipContent(`<b>Arrived!</b><br>${DESTINATION.address}`)
            .openTooltip();
          break;
        case 'ride_cancelled':
          if (offer) endOffer(offer.driver, false);
          ringLayer.clearLayers();
          riderDriverId = null;
          pickupLayer.clearLayers();
          if (pickup) person.setLatLng(ll(pickup)).addTo(map);
          break;
        case 'preview_cleared':
        case 'reset':
          clearRide();
          person.remove();
          pickup = null;
          dest
            .setTooltipContent(
              `<b>${DESTINATION.name}</b><br>${DESTINATION.address}`
            )
            .closeTooltip();
          if (e.type === 'reset')
            map.flyTo(ll(MAP_CENTER), MAP_ZOOM, { duration: 0.8 });
          break;
      }
    })
  );

  /** Detach from the bus and fleet, cancel pending timers and tear down Leaflet. */
  function destroy(): void {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
    timeouts.forEach((id) => clearTimeout(id));
    timeouts.clear();
    setHeatBrush({ ...heatBrush, tool: HeatTool.None });
    map.remove();
    cars.clear();
  }

  /** Cell outlines of the level on screen. */
  function setGridVisible(isVisible: boolean): void {
    toggleLevelPanes(LevelPaneKind.Outline, isVisible);
  }

  function setHeatVisible(isVisible: boolean): void {
    toggleLevelPanes(LevelPaneKind.Heat, isVisible);
  }

  /** Bold outlines of the next-coarser level over the current one. */
  function setParentOutlinesVisible(isVisible: boolean): void {
    toggleLevelPanes(LevelPaneKind.Parent, isVisible);
  }

  function setLevelMode(mode: LevelMode): void {
    levelMode = mode;
    updateLevel();
  }

  function toggleLevelPanes(kind: LevelPaneKind, isVisible: boolean): void {
    for (const res of HEAT_LEVELS) {
      map
        .getPane(levelPaneName(kind, res))
        ?.classList.toggle('hidden', !isVisible);
    }
  }

  /** Switch to the level the mode and zoom call for, fading the old one out. */
  function updateLevel(): void {
    const next: HeatLevel =
      levelMode === AUTO_LEVEL_MODE ? levelForZoom(map.getZoom()) : levelMode;
    if (next === level) return;
    const previous: HeatLevel = level;
    level = next;
    showLevel(next);
    fadeOutLevel(previous);
    clearHover();
    hideBrush();
    strokeCell = null;
    callbacks.onLevelChange(next);
  }

  function setLevelPanesShown(res: HeatLevel, isShown: boolean): void {
    const [add, remove] = isShown
      ? [LEVEL_PANE_CLASS.shown, LEVEL_PANE_CLASS.hidden]
      : [LEVEL_PANE_CLASS.hidden, LEVEL_PANE_CLASS.shown];
    for (const kind of Object.values(LevelPaneKind)) {
      const pane: HTMLElement | undefined = map.getPane(
        levelPaneName(kind, res)
      );
      pane?.classList.remove(...remove.split(' '));
      pane?.classList.add(...add.split(' '));
    }
  }

  function showLevel(res: HeatLevel): void {
    const layers: LevelLayers = levels.get(res) ?? buildLevel(res);
    layers.heat.addTo(map);
    layers.outline.addTo(map);
    layers.parentOutline?.addTo(map);
    // Other levels skip restyles while hidden, so catch up on show.
    restyleHeat(null);
    setLevelPanesShown(res, true);
  }

  /** Fade the panes, then drop the layers so hidden canvases stop redrawing. */
  function fadeOutLevel(res: HeatLevel): void {
    setLevelPanesShown(res, false);
    later(() => {
      if (res === level) return;
      const layers: LevelLayers | undefined = levels.get(res);
      layers?.heat.remove();
      layers?.outline.remove();
      layers?.parentOutline?.remove();
    }, LEVEL_FADE_MS);
  }

  function buildLevel(res: HeatLevel): LevelLayers {
    const heatRenderer: L.Canvas | undefined = renderers.get(
      levelPaneName(LevelPaneKind.Heat, res)
    );
    const heatPolys = new Map<string, L.Polygon>();
    const heat: L.LayerGroup = L.layerGroup();
    for (const cell of LEVEL_CELL_SETS.get(res)!) {
      const poly: L.Polygon = L.polygon(hexLatLngs(cell), {
        renderer: heatRenderer,
        stroke: false,
        interactive: false,
        fillOpacity: 0
      }).addTo(heat);
      heatPolys.set(cell, poly);
    }
    // One multi-polygon per outline layer: each cell's own boundary, so H3's
    // imperfect parent/child containment shows.
    const outline: L.Polygon = L.polygon(
      [...LEVEL_CELL_SETS.get(res)!].map((cell: string) => [hexLatLngs(cell)]),
      {
        renderer: renderers.get(levelPaneName(LevelPaneKind.Outline, res)),
        fill: false,
        interactive: false,
        ...outlineStyle
      }
    );
    const parent: HeatLevel | null = parentLevel(res);
    const parentOutline: L.Polygon | null =
      parent === null
        ? null
        : L.polygon(
            [...LEVEL_CELL_SETS.get(parent)!].map((cell: string) => [
              hexLatLngs(cell)
            ]),
            {
              renderer: renderers.get(levelPaneName(LevelPaneKind.Parent, res)),
              fill: false,
              interactive: false,
              ...parentOutlineStyle
            }
          );
    const layers: LevelLayers = { heatPolys, heat, outline, parentOutline };
    levels.set(res, layers);
    return layers;
  }

  /** Switch the heat editing tool; any active tool disables map dragging. */
  function setHeatBrush(brush: HeatBrush): void {
    const wasPainting: boolean = heatBrush.tool !== HeatTool.None;
    const isPainting: boolean = brush.tool !== HeatTool.None;
    const ringsChanged: boolean = brush.rings !== heatBrush.rings;
    heatBrush = { ...brush };
    if (isPainting && !wasPainting) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.getContainer().classList.add('leaflet-crosshair');
      clearHover();
    } else if (!isPainting && wasPainting) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove('leaflet-crosshair');
      endStroke();
      hideBrush();
    } else if (isPainting && ringsChanged && brushCell) {
      drawBrush(brushCell);
    }
  }

  /**
   * Restyle the level on screen. Shares are relative to the level's busiest
   * cell, so any change can recolour every cell: res 7/8 always restyle all,
   * res 9 only the changed cells unless the max moved.
   */
  function restyleHeat(changed: string[] | null): void {
    const layers: LevelLayers | undefined = levels.get(level);
    if (!layers) return;
    const max: number = world.heat.maxAt(level);
    const cells: Iterable<string> =
      changed === null || level !== HEAT_RES || max !== lastHeatMax
        ? layers.heatPolys.keys()
        : changed;
    if (level === HEAT_RES) lastHeatMax = max;
    for (const cell of cells) {
      layers.heatPolys
        .get(cell)
        ?.setStyle(heatStyle(world.heat.intensity(cell), level, isDarkBasemap));
    }
  }

  function brushRings(): number {
    return level === HEAT_LEVELS[0]
      ? Math.min(heatBrush.rings, MAX_RES7_BRUSH_RINGS)
      : heatBrush.rings;
  }

  /** Paints once per cell entered at the level on screen, so a still cursor doesn't pile up. */
  function paintStroke(p: L.LatLng): void {
    const cell: string = latLngToCell(p.lat, p.lng, level);
    if (cell === strokeCell) return;
    strokeCell = cell;
    const { tool, strength } = heatBrush;
    world.heat.paint(p, brushRings(), strength, tool === HeatTool.Erase, level);
  }

  function endStroke(): void {
    isStroking = false;
    strokeCell = null;
  }

  function showBrush(p: L.LatLng): void {
    const cell: string = latLngToCell(p.lat, p.lng, level);
    if (cell === brushCell && brushHex) return;
    drawBrush(cell);
  }

  /** `cell` is at the level on screen; the brush is a disk of that level. */
  function drawBrush(cell: string): void {
    brushCell = cell;
    const outline = cellsToMultiPolygon(
      gridDisk(cell, brushRings())
    ) as L.LatLngTuple[][][];
    if (!brushHex) {
      brushHex = L.polygon(outline, {
        className: HEX_CLASS.brush,
        interactive: false
      });
    } else {
      brushHex.setLatLngs(outline);
    }
    brushHex.addTo(map);
  }

  function hideBrush(): void {
    brushHex?.remove();
    brushCell = null;
  }

  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  }

  /** Called every animation frame. */
  function frame(now: number): void {
    for (const d of world.drivers.values()) {
      const view = cars.get(d.id);
      if (!view) continue;
      view.marker.setLatLng(ll(d.pos));
      view.body.style.transform = `rotate(${d.heading}deg)`;
      const cls = `car state-${d.state}${d.brain === 'llm' ? ' llm' : ''}${d.id === riderDriverId ? ' mine' : ''}`;
      if (cls !== view.stateClass) {
        const keep = ['has-rider', 'flash-yes', 'flash-no'].filter((c) =>
          view.root.classList.contains(c)
        );
        view.root.className = [cls, ...keep].join(' ');
        view.stateClass = cls;
        view.marker.setZIndexOffset(d.state === 'idle' ? 0 : 500);
      }
    }
    if (offer) {
      const { driver, startedAt } = offer;
      const view = cars.get(driver.id);
      const left = Math.max(0, OFFER_TIMEOUT_MS - (now - startedAt));
      if (view) {
        view.ringFg.style.strokeDashoffset = String(
          RING_C * (1 - left / OFFER_TIMEOUT_MS)
        );
        view.timer.textContent = String(Math.ceil(left / 1000));
      }
      if (offerLine && pickup)
        offerLine.setLatLngs([ll(driver.pos), ll(pickup)]);
    }
  }

  function endOffer(driver: Driver, accepted: boolean): void {
    if (offer?.driver !== driver) return;
    offer = null;
    offerLine?.remove();
    offerLine = null;
    const view = cars.get(driver.id);
    if (!view) return;
    const cls = accepted ? 'flash-yes' : 'flash-no';
    view.timer.textContent = accepted ? '✓' : '✗';
    view.root.classList.add(cls);
    later(() => {
      view.root.classList.remove(cls);
      view.timer.textContent = '';
      view.ringFg.style.strokeDashoffset = '0';
    }, 1200);
  }

  /** Swap the tile layer and restyle the outlines and heat for its theme. */
  function setBasemap(basemap: Basemap): void {
    if (basemap === currentBasemap) return;
    basemapTileLayer?.remove();
    currentBasemap = basemap;
    basemapTileLayer = basemapLayer(basemap).addTo(map);
    map.getContainer().classList.toggle('theme-dark', basemap.dark);
    const theme: 'light' | 'dark' = basemap.dark ? 'dark' : 'light';
    outlineStyle = outlinePathOptions(OUTLINE_STYLE[theme]);
    parentOutlineStyle = outlinePathOptions(PARENT_OUTLINE_STYLE[theme]);
    for (const layers of levels.values()) {
      layers.outline.setStyle(outlineStyle);
      layers.parentOutline?.setStyle(parentOutlineStyle);
    }
    isDarkBasemap = basemap.dark;
    restyleHeat(null);
    saveBasemap(basemap);
  }

  function drawTrip(route: Route, cells: string[]): void {
    routeLayer.clearLayers();
    for (const c of cells) {
      L.polygon(hexLatLngs(c), {
        className: HEX_CLASS.route,
        interactive: false
      }).addTo(routeLayer);
    }
    L.polyline(route.points.map(ll), {
      className: LINE_CLASS.tripCasing,
      interactive: false
    }).addTo(routeLayer);
    const line = L.polyline(route.points.map(ll), {
      className: LINE_CLASS.tripRoute,
      interactive: false
    }).addTo(routeLayer);
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
    }).addTo(routeLayer);
    map.flyToBounds(line.getBounds().pad(0.15), { duration: 0.9 });
  }

  function clearRide(): void {
    if (offer) endOffer(offer.driver, false);
    ringLayer.clearLayers();
    routeLayer.clearLayers();
    pickupLayer.clearLayers();
    riderDriverId = null;
  }

  function syncFleet(): void {
    for (const [id, view] of cars) {
      if (!world.drivers.has(id)) {
        view.marker.remove();
        cars.delete(id);
      }
    }
    for (const d of world.drivers.values()) {
      if (cars.has(d.id)) continue;
      const marker = L.marker(ll(d.pos), {
        icon: carIcon(d),
        riseOnHover: true
      }).addTo(map);
      // One persistent container per car; React portals DriverPopup into it.
      const container = document.createElement('div');
      container.className = 'driver-popup min-w-56 font-inter text-fluid-s';
      marker.bindPopup(container, { offset: [0, -12] });
      marker.on('popupopen', (e: L.PopupEvent) =>
        callbacks.onDriverPopupOpen({
          driver: d,
          container,
          popup: e.popup
        })
      );
      marker.on('popupclose', () => callbacks.onDriverPopupClose(d));
      const root = marker.getElement()!.querySelector<HTMLElement>('.car')!;
      cars.set(d.id, {
        marker,
        root,
        body: root.querySelector('.car-body')!,
        ringFg: root.querySelector('.ring-fg')!,
        timer: root.querySelector('.timer')!,
        stateClass: ''
      });
    }
  }

  /** Hover the cell of the level on screen, with its parent and children. */
  function showCellInfo(p: L.LatLng): void {
    const res: HeatLevel = level;
    const cell: string = latLngToCell(p.lat, p.lng, res);
    if (!LEVEL_CELL_SETS.get(res)!.has(cell)) {
      clearHover();
      return;
    }
    const parentRes: HeatLevel | null = parentLevel(res);
    const parent: string | null =
      parentRes === null ? null : cellToParent(cell, parentRes);
    const childRes: HeatLevel | null = childLevel(res);
    const children: string[] =
      childRes === null
        ? []
        : cellToChildren(cell, childRes).filter((child: string) =>
            LEVEL_CELL_SETS.get(childRes)!.has(child)
          );
    if (cell !== hoveredCell?.cell) {
      hoverLayer.clearLayers();
      if (children.length > 0) {
        L.polygon(
          children.map((child: string) => [hexLatLngs(child)]),
          { className: HEX_CLASS.hoverChildren, interactive: false }
        ).addTo(hoverLayer);
      }
      L.polygon(hexLatLngs(cell), {
        className: HEX_CLASS.hover,
        interactive: false
      }).addTo(hoverLayer);
      if (parent !== null) {
        L.polygon(hexLatLngs(parent), {
          className: HEX_CLASS.hoverParent,
          interactive: false
        }).addTo(hoverLayer);
      }
    }
    reportCellHover({
      cell,
      res,
      parent,
      children: children.length,
      demand: world.heat.total(cell),
      share: world.heat.intensity(cell),
      breadcrumb: HEAT_LEVELS.filter((r: HeatLevel) => r <= res).map(
        (r: HeatLevel) => ({
          res: r,
          cell: r === res ? cell : cellToParent(cell, r)
        })
      ),
      driversHere: countDriversIn(cell, res),
      occupiedCells: world.index.occupiedCellCount
    });
  }

  /** Drivers are indexed by dispatch cell, so roll up coarser and scan finer. */
  function countDriversIn(cell: string, res: HeatLevel): number {
    const { byCell } = world.index;
    if (res > H3_RES) {
      let count: number = 0;
      for (const d of world.drivers.values()) {
        if (toHeatCell(d.pos) === cell) count++;
      }
      return count;
    }
    const dispatchCells: string[] =
      res === H3_RES ? [cell] : cellToChildren(cell, H3_RES);
    return dispatchCells.reduce(
      (sum: number, c: string) => sum + (byCell.get(c)?.size ?? 0),
      0
    );
  }

  function clearHover(): void {
    hoverLayer.clearLayers();
    reportCellHover(null);
  }

  /** Only notifies React when what the overlay shows actually changed. */
  function reportCellHover(info: CellHoverInfo | null): void {
    const prev = hoveredCell;
    if (
      prev === info ||
      (prev &&
        info &&
        prev.cell === info.cell &&
        prev.demand === info.demand &&
        prev.share === info.share &&
        prev.driversHere === info.driversHere &&
        prev.occupiedCells === info.occupiedCells)
    ) {
      return;
    }
    hoveredCell = info;
    callbacks.onCellHover(info);
  }

  return {
    map,
    destroy,
    setGridVisible,
    setHeatVisible,
    setParentOutlinesVisible,
    setLevelMode,
    setHeatBrush,
    frame,
    setBasemap
  };
}
