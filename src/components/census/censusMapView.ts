import L from 'leaflet';
import { cellToBoundary, cellToParent, latLngToCell } from 'h3-js';
import type { FeatureCollection } from 'geojson';
import blockGroupShapes from '@/lib/census/data/blockGroupShapes.json';
import {
  CENSUS_LEVELS,
  CensusRamp,
  bandOf,
  cellDetails,
  sourceBlockGroups,
  type CellDetail,
  type CensusLevel,
  type HexLayer
} from '@/lib/census/hexData';
import { basemapLayer, type Basemap } from '@/components/map/basemaps';

export const CENSUS_AUTO_LEVEL = 'auto' as const;
/** 'auto' picks the level from the zoom; a CensusLevel pins the map to it. */
export type CensusLevelMode = CensusLevel | typeof CENSUS_AUTO_LEVEL;

export enum CensusColorScale {
  /** Quantile bands from `bandOf`, one ramp colour each. */
  Bands = 'bands',
  /** value / level max, interpolated along the ramp. */
  Linear = 'linear',
  /** sqrt(value / level max), so the many small cells still read. */
  Sqrt = 'sqrt'
}

/** Matches the Grid level options and the hover box title. */
export const CENSUS_LEVEL_NAME: Record<CensusLevel, string> = {
  7: 'city',
  8: 'neighbourhood',
  9: 'street'
};

/**
 * Colour ramps per dataset, low to high on light basemaps, each in roughly
 * even lightness steps. Population runs mint through azure to deep blue
 * (L* 93, 83, 67, 46, 27); crime runs pale yellow through amber and orange to
 * deep red (L* 94, 76, 60, 43, 27), so the two ramps share a lightness curve
 * but never a hue. Dark basemaps run each reversed so busy cells glow instead
 * of sinking into the map. CensusLegend mirrors both.
 */
export const CENSUS_RAMP_TOKENS: Record<CensusRamp, string[]> = {
  [CensusRamp.Population]: [
    'teal-20',
    'teal-40',
    'blue-40',
    'blue-60',
    'blue-80'
  ],
  [CensusRamp.Crime]: [
    'yellow-20',
    'yellow-50',
    'orange-50',
    'orange-70',
    'orange-90'
  ]
};

/** Number of colour bands, shared by every ramp. */
export const CENSUS_BAND_COUNT: number =
  CENSUS_RAMP_TOKENS[CensusRamp.Population].length;

/** Why a drawn cell has (or lacks) a colour from the ramp. */
export enum CensusCellStatus {
  Value = 'value',
  /** Rate layers: too few residents for a rate. */
  TooFewResidents = 'tooFewResidents',
  /** Crime layers: outside Omaha Police coverage. */
  NoData = 'noData'
}

type CensusPlaceholderStatus = Exclude<
  CensusCellStatus,
  CensusCellStatus.Value
>;

interface OutlineTokenStyle {
  color: string;
  opacity: number;
  weight: number;
}

interface PlaceholderTokenStyle {
  color: string;
  /** Fixed fill opacity; placeholders ignore the opacity slider. */
  fillOpacity: number;
  /** Dashed cell outline drawn on the fill canvas, or none. */
  dash: OutlineTokenStyle | null;
}

/** Canvas px dash pattern for "no data" outlines; no token for canvas px. */
const PLACEHOLDER_DASH_ARRAY: string = '3 3';

/**
 * Canvas styles for cells without a ramp colour, per basemap theme; colours
 * are colour tokens. "Too few residents" is a solid mid grey: neutral where
 * every ramp band is saturated, and mid-light where the lowest bands are
 * near-white (light) or near-black (dark). "No data" is an outline-only
 * dashed hex over a bare wash, so it reads as empty rather than as a value.
 * CensusLegend mirrors these swatches.
 */
export const CENSUS_PLACEHOLDER_STYLE: Record<
  CensusPlaceholderStatus,
  Record<'light' | 'dark', PlaceholderTokenStyle>
> = {
  [CensusCellStatus.TooFewResidents]: {
    light: { color: 'gray-30', fillOpacity: 0.65, dash: null },
    dark: { color: 'gray-50', fillOpacity: 0.8, dash: null }
  },
  [CensusCellStatus.NoData]: {
    light: {
      color: 'gray-50',
      fillOpacity: 0.08,
      dash: { color: 'gray-40', opacity: 0.6, weight: 1 }
    },
    dark: {
      color: 'gray-20',
      fillOpacity: 0.08,
      dash: { color: 'gray-20', opacity: 0.6, weight: 1 }
    }
  }
};

/**
 * Scales the opacity slider per basemap theme (capped at 1): on a dark
 * basemap the reversed ramp's bright end only glows with a little more
 * coverage, while its dark end still sinks into the map.
 */
const CENSUS_THEME_OPACITY: Record<'light' | 'dark', number> = {
  light: 1,
  dark: 1.3
};

/** What the hovered cell holds, reported to React for the hover box. */
export interface CensusCellHover {
  cell: string;
  res: CensusLevel;
  /** The next-coarser level's cell, or null at res 7. */
  parent: string | null;
  status: CensusCellStatus;
  /** The coloured value; 0 unless status is Value. */
  value: number;
  /** 0-based quantile band, 0–4. */
  band: number;
  /** value / the level's busiest cell, 0–1. */
  share: number;
  /** GEOIDs of the block groups that put people into the cell. */
  blockGroups: string[];
  /** Residents and incident counts for crime layers; empty for population. */
  details: CellDetail[];
}

export interface CensusMapSettings {
  layer: HexLayer;
  levelMode: CensusLevelMode;
  colorScale: CensusColorScale;
  /** Fill opacity, 0.2–1. */
  opacity: number;
  isHexOutlinesVisible: boolean;
  isBlockGroupOutlinesVisible: boolean;
  basemap: Basemap;
}

export interface CensusMapCallbacks {
  onLevelChange: (level: CensusLevel) => void;
  onCellHover: (hover: CensusCellHover | null) => void;
}

/** Service area the map opens on: Omaha plus Council Bluffs. */
const SERVICE_AREA_BOUNDS: L.LatLngBoundsExpression = [
  [41.2, -96.2],
  [41.345, -95.875]
];

const levelForZoom = (zoom: number): CensusLevel =>
  zoom <= 11 ? 7 : zoom <= 13 ? 8 : 9;

const parentLevel = (res: CensusLevel): CensusLevel | null =>
  res === CENSUS_LEVELS[0] ? null : ((res - 1) as CensusLevel);

const hexLatLngs = (cell: string): L.LatLngTuple[] =>
  cellToBoundary(cell) as L.LatLngTuple[];

enum CensusPaneKind {
  Fill = 'census-fill',
  Outline = 'census-outline'
}

const censusPaneName = (kind: CensusPaneKind, res: CensusLevel): string =>
  `${kind}-${res}`;

const BLOCK_GROUP_PANE: string = 'census-block-groups';

// Unlayered leaflet.css outranks Tailwind's z-* utilities, so set it inline.
// Basemap (200) < fill (350) < hex outline (360) < block groups (380) <
// SVG hover in the overlay pane (400).
const CENSUS_PANE_Z: Record<CensusPaneKind | typeof BLOCK_GROUP_PANE, string> =
  {
    [CensusPaneKind.Fill]: '350',
    [CensusPaneKind.Outline]: '360',
    [BLOCK_GROUP_PANE]: '380'
  };

/**
 * Level crossfade: every level pane carries `base`, plus `shown` or `hidden`.
 * CENSUS_FADE_MS must match the duration class.
 */
const CENSUS_PANE_CLASS = {
  base: 'census-level-pane transition-opacity duration-300',
  shown: 'opacity-100 ease-out',
  hidden: 'opacity-0 pointer-events-none ease-in'
};
const CENSUS_FADE_MS: number = 300;

/** Hovered cell outline; Leaflet sets the class on the SVG path. */
const HOVER_HEX_CLASS: string =
  'census-hover-hex fill-none stroke-gray-90 stroke-3 in-[.theme-dark]:stroke-gray-5';

/**
 * Canvas outline styles per basemap theme; `color` is a colour token. Hex
 * outlines take the basemap's own tone, so they read as gaps between tiles;
 * block-group boundaries take the opposite tone at ~2x the width, so they
 * read as lines drawn on top. Widths are canvas px, so there is no token.
 */
const HEX_OUTLINE_STYLE: Record<'light' | 'dark', OutlineTokenStyle> = {
  light: { color: 'gray-5', opacity: 0.7, weight: 0.9 },
  dark: { color: 'gray-90', opacity: 0.7, weight: 0.9 }
};

const BLOCK_GROUP_OUTLINE_STYLE: Record<'light' | 'dark', OutlineTokenStyle> = {
  light: { color: 'gray-90', opacity: 0.75, weight: 1.5 },
  dark: { color: 'gray-5', opacity: 0.7, weight: 1.5 }
};

/** Canvas can't read CSS variables, so read a token's raw `H S% L%`. */
const tokenHsl = (name: string): number[] =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
    .split(/\s+/)
    .map((part: string) => parseFloat(part));

const hslString = ([h, s, l]: number[]): string => `hsl(${h} ${s}% ${l}%)`;

const outlinePathOptions = ({
  color,
  opacity,
  weight
}: OutlineTokenStyle): L.PathOptions => ({
  color: hslString(tokenHsl(color)),
  opacity,
  weight
});

/** One level's canvas layers, built on first show and kept. */
interface CensusLevelLayers {
  fillPolys: Map<string, L.Polygon>;
  fill: L.LayerGroup;
  outline: L.Polygon;
}

/** Imperative Leaflet map for the census page; React drives it via setters. */
export class CensusMapView {
  readonly map: L.Map;
  private settings: CensusMapSettings;
  private level: CensusLevel;
  private levels = new Map<CensusLevel, CensusLevelLayers>();
  private renderers = new Map<string, L.Canvas>();
  private rampHsl: number[][] = [];
  private isDark: boolean = false;
  private basemapLayer: L.Layer | null = null;
  private blockGroupLayer: L.GeoJSON | null = null;
  private hoverLayer: L.LayerGroup = L.layerGroup();
  private hoveredCell: string | null = null;
  private fadeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    el: HTMLElement,
    settings: CensusMapSettings,
    private callbacks: CensusMapCallbacks
  ) {
    this.settings = settings;
    this.map = L.map(el, { zoomControl: false }).fitBounds(SERVICE_AREA_BOUNDS);
    // Top-right keeps the left edge free for the control panel drawer.
    L.control.zoom({ position: 'topright' }).addTo(this.map);
    for (const res of CENSUS_LEVELS) {
      for (const kind of Object.values(CensusPaneKind)) {
        const name: string = censusPaneName(kind, res);
        const pane: HTMLElement = this.map.createPane(name);
        pane.style.zIndex = CENSUS_PANE_Z[kind];
        pane.classList.add(
          ...CENSUS_PANE_CLASS.base.split(' '),
          ...CENSUS_PANE_CLASS.hidden.split(' ')
        );
        this.renderers.set(name, L.canvas({ padding: 0.3, pane: name }));
      }
    }
    const blockGroupPane: HTMLElement = this.map.createPane(BLOCK_GROUP_PANE);
    blockGroupPane.style.zIndex = CENSUS_PANE_Z[BLOCK_GROUP_PANE];
    blockGroupPane.classList.add('pointer-events-none');

    this.applyBasemap(settings.basemap);
    this.setHexOutlinesVisible(settings.isHexOutlinesVisible);
    this.setBlockGroupOutlinesVisible(settings.isBlockGroupOutlinesVisible);
    this.hoverLayer.addTo(this.map);

    this.level = this.levelFor(settings.levelMode);
    this.showLevel(this.level);
    this.callbacks.onLevelChange(this.level);

    this.map.on('zoomend', () => this.updateLevel());
    this.map.on('mousemove', (e: L.LeafletMouseEvent) =>
      this.showHover(e.latlng)
    );
    this.map.on('mouseout', () => this.clearHover());
  }

  destroy(): void {
    this.fadeTimeouts.forEach((id) => clearTimeout(id));
    this.fadeTimeouts.clear();
    this.map.remove();
  }

  /**
   * A new dataset or crime filter: the drawn cells differ per layer, so drop
   * every built level (fading ones too) and rebuild the one on screen.
   */
  setLayer(layer: HexLayer): void {
    if (layer === this.settings.layer) return;
    this.settings = { ...this.settings, layer };
    for (const layers of this.levels.values()) {
      layers.fill.remove();
      layers.outline.remove();
    }
    this.levels.clear();
    this.showLevel(this.level);
    this.clearHover();
  }

  setLevelMode(levelMode: CensusLevelMode): void {
    if (levelMode === this.settings.levelMode) return;
    this.settings = { ...this.settings, levelMode };
    this.updateLevel();
  }

  setColorScale(colorScale: CensusColorScale): void {
    if (colorScale === this.settings.colorScale) return;
    this.settings = { ...this.settings, colorScale };
    this.restyleFill();
  }

  setOpacity(opacity: number): void {
    if (opacity === this.settings.opacity) return;
    this.settings = { ...this.settings, opacity };
    this.restyleFill();
  }

  setHexOutlinesVisible(isVisible: boolean): void {
    this.settings = { ...this.settings, isHexOutlinesVisible: isVisible };
    for (const res of CENSUS_LEVELS) {
      this.map
        .getPane(censusPaneName(CensusPaneKind.Outline, res))
        ?.classList.toggle('hidden', !isVisible);
    }
  }

  /** Block-group outlines load on first show and are kept afterwards. */
  setBlockGroupOutlinesVisible(isVisible: boolean): void {
    this.settings = {
      ...this.settings,
      isBlockGroupOutlinesVisible: isVisible
    };
    if (!isVisible) {
      this.blockGroupLayer?.remove();
      return;
    }
    if (!this.blockGroupLayer) {
      this.blockGroupLayer = L.geoJSON(
        blockGroupShapes as FeatureCollection,
        {
          pane: BLOCK_GROUP_PANE,
          renderer: L.canvas({ padding: 0.3, pane: BLOCK_GROUP_PANE }),
          interactive: false,
          style: () => this.blockGroupStyle()
        } as L.GeoJSONOptions
      );
    }
    this.blockGroupLayer.addTo(this.map);
  }

  setBasemap(basemap: Basemap): void {
    if (basemap === this.settings.basemap) return;
    this.settings = { ...this.settings, basemap };
    this.applyBasemap(basemap);
  }

  private applyBasemap(basemap: Basemap): void {
    this.basemapLayer?.remove();
    this.basemapLayer = basemapLayer(basemap).addTo(this.map);
    this.map.getContainer().classList.toggle('theme-dark', basemap.dark);
    this.isDark = basemap.dark;
    this.restyleFill();
    const outlineStyle: L.PathOptions = this.hexOutlineStyle();
    for (const layers of this.levels.values()) {
      layers.outline.setStyle(outlineStyle);
    }
    this.blockGroupLayer?.setStyle(this.blockGroupStyle());
  }

  private hexOutlineStyle(): L.PathOptions {
    return outlinePathOptions(
      HEX_OUTLINE_STYLE[this.isDark ? 'dark' : 'light']
    );
  }

  private blockGroupStyle(): L.PathOptions {
    return {
      ...outlinePathOptions(
        BLOCK_GROUP_OUTLINE_STYLE[this.isDark ? 'dark' : 'light']
      ),
      fill: false
    };
  }

  private levelFor(levelMode: CensusLevelMode): CensusLevel {
    return levelMode === CENSUS_AUTO_LEVEL
      ? levelForZoom(this.map.getZoom())
      : levelMode;
  }

  /** Switch to the level the mode and zoom call for, fading the old one out. */
  private updateLevel(): void {
    const next: CensusLevel = this.levelFor(this.settings.levelMode);
    if (next === this.level) return;
    const previous: CensusLevel = this.level;
    this.level = next;
    this.showLevel(next);
    this.fadeOutLevel(previous);
    this.clearHover();
    this.callbacks.onLevelChange(next);
  }

  private setLevelPanesShown(res: CensusLevel, isShown: boolean): void {
    const [add, remove] = isShown
      ? [CENSUS_PANE_CLASS.shown, CENSUS_PANE_CLASS.hidden]
      : [CENSUS_PANE_CLASS.hidden, CENSUS_PANE_CLASS.shown];
    for (const kind of Object.values(CensusPaneKind)) {
      const pane: HTMLElement | undefined = this.map.getPane(
        censusPaneName(kind, res)
      );
      pane?.classList.remove(...remove.split(' '));
      pane?.classList.add(...add.split(' '));
    }
  }

  /** Fade the panes, then drop the layers so hidden canvases stop redrawing. */
  private fadeOutLevel(res: CensusLevel): void {
    this.setLevelPanesShown(res, false);
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.fadeTimeouts.delete(timeout);
      if (res === this.level) return;
      this.levels.get(res)?.fill.remove();
      this.levels.get(res)?.outline.remove();
    }, CENSUS_FADE_MS);
    this.fadeTimeouts.add(timeout);
  }

  private showLevel(res: CensusLevel): void {
    const layers: CensusLevelLayers =
      this.levels.get(res) ?? this.buildLevel(res);
    layers.fill.addTo(this.map);
    layers.outline.addTo(this.map);
    this.restyleFill();
    this.setLevelPanesShown(res, true);
  }

  private buildLevel(res: CensusLevel): CensusLevelLayers {
    const { layer } = this.settings;
    // Placeholders first so the canvas paints coloured cells over them.
    const cells: Set<string> = new Set<string>([
      ...layer.noData.get(res)!,
      ...layer.tooFewResidents.get(res)!,
      ...layer.values.get(res)!.keys()
    ]);
    const fillRenderer: L.Canvas | undefined = this.renderers.get(
      censusPaneName(CensusPaneKind.Fill, res)
    );
    const fillPolys = new Map<string, L.Polygon>();
    const fill: L.LayerGroup = L.layerGroup();
    for (const cell of cells) {
      const poly: L.Polygon = L.polygon(hexLatLngs(cell), {
        renderer: fillRenderer,
        stroke: false,
        interactive: false,
        fillOpacity: 0
      }).addTo(fill);
      fillPolys.set(cell, poly);
    }
    // One multi-polygon for every outline of the level keeps canvas redraws cheap.
    const outline: L.Polygon = L.polygon(
      [...cells].map((cell: string) => [hexLatLngs(cell)]),
      {
        renderer: this.renderers.get(
          censusPaneName(CensusPaneKind.Outline, res)
        ),
        fill: false,
        interactive: false,
        ...this.hexOutlineStyle()
      }
    );
    const layers: CensusLevelLayers = { fillPolys, fill, outline };
    this.levels.set(res, layers);
    return layers;
  }

  /** Restyle the level on screen; hidden levels catch up when shown. */
  private restyleFill(): void {
    const layers: CensusLevelLayers | undefined = this.levels.get(this.level);
    if (!layers) return;
    const { layer } = this.settings;
    const rampTokens: string[] = CENSUS_RAMP_TOKENS[layer.dataset.ramp];
    this.rampHsl = (this.isDark ? [...rampTokens].reverse() : rampTokens).map(
      tokenHsl
    );
    const theme: 'light' | 'dark' = this.isDark ? 'dark' : 'light';
    // Keyed by placeholder status only, so Value cells fall through to the ramp.
    const placeholderStyles = new Map<CensusCellStatus, L.PathOptions>(
      (
        Object.entries(CENSUS_PLACEHOLDER_STYLE) as [
          CensusPlaceholderStatus,
          Record<'light' | 'dark', PlaceholderTokenStyle>
        ][]
      ).map(([status, styles]) => {
        const { color, fillOpacity, dash } = styles[theme];
        return [
          status,
          {
            fillColor: hslString(tokenHsl(color)),
            fillOpacity,
            ...(dash
              ? {
                  ...outlinePathOptions(dash),
                  stroke: true,
                  dashArray: PLACEHOLDER_DASH_ARRAY
                }
              : {})
          }
        ];
      })
    );
    for (const [cell, poly] of layers.fillPolys) {
      const status: CensusCellStatus | null = this.cellStatus(cell, this.level);
      poly.setStyle(
        (status && placeholderStyles.get(status)) ??
          this.fillStyle(layer.values.get(this.level)!.get(cell) ?? 0)
      );
    }
  }

  /** Status of a cell at `res`, or null when the layer doesn't draw it. */
  private cellStatus(cell: string, res: CensusLevel): CensusCellStatus | null {
    const { layer } = this.settings;
    if (layer.values.get(res)!.has(cell)) return CensusCellStatus.Value;
    if (layer.tooFewResidents.get(res)!.has(cell)) {
      return CensusCellStatus.TooFewResidents;
    }
    if (layer.noData.get(res)!.has(cell)) return CensusCellStatus.NoData;
    return null;
  }

  private fillStyle(value: number): L.PathOptions {
    const { layer, colorScale, opacity } = this.settings;
    // Empty population cells stay clear; crime-free cells take band 0.
    if (value <= 0 && !layer.dataset.usesCrimeFilter) {
      return { fillOpacity: 0 };
    }
    let fillColor: string = '';
    if (colorScale === CensusColorScale.Bands) {
      fillColor = hslString(this.rampHsl[bandOf(layer, this.level, value)]);
    } else {
      const share: number = value / (layer.max.get(this.level) || 1);
      fillColor = this.rampColor(
        colorScale === CensusColorScale.Sqrt ? Math.sqrt(share) : share
      );
    }
    return {
      fillColor,
      fillOpacity: Math.min(
        1,
        opacity * CENSUS_THEME_OPACITY[this.isDark ? 'dark' : 'light']
      )
    };
  }

  /** Interpolate the ramp stops in HSL for t in 0–1. */
  private rampColor(t: number): string {
    const position: number =
      Math.min(1, Math.max(0, t)) * (this.rampHsl.length - 1);
    const index: number = Math.min(
      this.rampHsl.length - 2,
      Math.floor(position)
    );
    const fraction: number = position - index;
    const from: number[] = this.rampHsl[index];
    const to: number[] = this.rampHsl[index + 1];
    return hslString(
      from.map(
        (channel: number, i: number) => channel + (to[i] - channel) * fraction
      )
    );
  }

  private showHover(p: L.LatLng): void {
    const res: CensusLevel = this.level;
    const cell: string = latLngToCell(p.lat, p.lng, res);
    const { layer } = this.settings;
    const status: CensusCellStatus | null = this.cellStatus(cell, res);
    if (status === null) {
      this.clearHover();
      return;
    }
    const value: number = layer.values.get(res)!.get(cell) ?? 0;
    if (cell === this.hoveredCell) return;
    this.hoveredCell = cell;
    this.hoverLayer.clearLayers();
    L.polygon(hexLatLngs(cell), {
      className: HOVER_HEX_CLASS,
      interactive: false
    }).addTo(this.hoverLayer);
    const parentRes: CensusLevel | null = parentLevel(res);
    this.callbacks.onCellHover({
      cell,
      res,
      parent: parentRes === null ? null : cellToParent(cell, parentRes),
      status,
      value,
      band: bandOf(layer, res, value),
      share: value / (layer.max.get(res) || 1),
      blockGroups: sourceBlockGroups(cell),
      details: cellDetails(layer, cell)
    });
  }

  private clearHover(): void {
    if (this.hoveredCell === null) return;
    this.hoveredCell = null;
    this.hoverLayer.clearLayers();
    this.callbacks.onCellHover(null);
  }
}
