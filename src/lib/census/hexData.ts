import { cellToParent, getResolution } from 'h3-js';
import blockGroupData from '@/lib/census/data/blockGroups.json';
import crimeData from '@/lib/census/data/crime2025.json';

/** H3 levels the census map can show, coarse to fine; data lives at res 9. */
export const CENSUS_LEVELS = [7, 8, 9] as const;
export type CensusLevel = (typeof CENSUS_LEVELS)[number];
const BASE_RES: CensusLevel = 9;

export interface BlockGroup {
  geoid: string;
  /** State + county FIPS, e.g. 31055 (Douglas, NE) or 19155 (Pottawattamie, IA). */
  county: string;
  population: number;
  housingUnits: number;
  /** The res-9 cells whose centre lies in this block group. */
  cells: string[];
}

export const BLOCK_GROUPS: BlockGroup[] = blockGroupData.blockGroups;
export const CENSUS_SOURCE: string = blockGroupData.source;

/** County FIPS covered by the Omaha Police Department (Douglas County, NE). */
const OPD_COUNTY = '31055';

export enum CrimeCategory {
  All = 'all',
  Violent = 'violent',
  Property = 'property',
  Other = 'other'
}

export const CRIME_CATEGORY_LABEL: Record<CrimeCategory, string> = {
  [CrimeCategory.All]: 'All crimes',
  [CrimeCategory.Violent]: 'Violent',
  [CrimeCategory.Property]: 'Property',
  [CrimeCategory.Other]: 'Other offenses'
};

/** Which crime cases a crime dataset counts. */
export interface CrimeFilter {
  category: CrimeCategory;
  /** Add non-criminal calls (sickness, overdose, deaths…) to All crimes. */
  includeNonCriminal: boolean;
}

export const DEFAULT_CRIME_FILTER: CrimeFilter = {
  category: CrimeCategory.All,
  includeNonCriminal: false
};

/** Column indexes of each cell's counts in crime2025.json (see `columns`). */
const CRIME_COLUMN = Object.fromEntries(
  crimeData.columns.map((name: string, i: number) => [name, i])
) as Record<string, number>;
export const CRIME_SOURCE: string = crimeData.source;
export const CRIME_YEAR: number = crimeData.year;
const CRIME_CELLS = crimeData.cells as Record<string, number[]>;

function crimeColumn(filter: CrimeFilter): number {
  if (filter.category !== CrimeCategory.All) {
    return CRIME_COLUMN[filter.category];
  }
  return CRIME_COLUMN[filter.includeNonCriminal ? 'allInclNonCriminal' : 'all'];
}

export enum CensusDatasetId {
  Population = 'population',
  Crime = 'crime',
  CrimeRate = 'crimeRate'
}

export enum DatasetKind {
  /** Counts that add up from res 9 to res 8 and 7. */
  Count = 'count',
  /** Incidents per 1,000 residents, from summed incidents / summed residents. */
  Rate = 'rate'
}

export enum CensusRamp {
  Population = 'population',
  Crime = 'crime'
}

export interface CensusDataset {
  id: CensusDatasetId;
  label: string;
  kind: DatasetKind;
  ramp: CensusRamp;
  /** Singular / plural unit for hover text, e.g. "person" / "people". */
  unit: [string, string];
  /** Short source line for the legend. */
  source: string;
  /** Whether the crime category filter applies. */
  usesCrimeFilter: boolean;
}

/** The datasets the census page can show; add entries here to extend it. */
export const CENSUS_DATASETS: CensusDataset[] = [
  {
    id: CensusDatasetId.Population,
    label: 'Population (2020 Census)',
    kind: DatasetKind.Count,
    ramp: CensusRamp.Population,
    unit: ['person', 'people'],
    source: 'Source: 2020 Census, U.S. Census Bureau',
    usesCrimeFilter: false
  },
  {
    id: CensusDatasetId.Crime,
    label: `Police incidents (${CRIME_YEAR})`,
    kind: DatasetKind.Count,
    ramp: CensusRamp.Crime,
    unit: ['incident', 'incidents'],
    source: `Source: Omaha Police Department, ${CRIME_YEAR}`,
    usesCrimeFilter: true
  },
  {
    id: CensusDatasetId.CrimeRate,
    label: `Incidents per 1,000 residents (${CRIME_YEAR})`,
    kind: DatasetKind.Rate,
    ramp: CensusRamp.Crime,
    unit: ['per 1,000 residents', 'per 1,000 residents'],
    source: `Sources: Omaha Police Department ${CRIME_YEAR}; 2020 Census`,
    usesCrimeFilter: true
  }
];

/**
 * Fewest residents a cell needs before its rate is shown; below this a few
 * incidents in a near-empty cell (downtown, industrial land) would swamp
 * the map. Scales with cell size (~7× per level).
 */
export const RATE_MIN_RESIDENTS: Record<CensusLevel, number> = {
  7: 1000,
  8: 200,
  9: 50
};

/** Every cell -> the block groups that put people into it. */
const SOURCES = new Map<CensusLevel, Map<string, string[]>>();

export interface HexLayer {
  dataset: CensusDataset;
  filter: CrimeFilter;
  /**
   * Cell -> value at each level, only for cells that have a value to colour.
   * Count layers: sums of their children. Rate layers: per 1,000 residents.
   */
  values: Map<CensusLevel, Map<string, number>>;
  /** Crime layers: incidents matching the filter, summed per level. */
  incidents: Map<CensusLevel, Map<string, number>> | null;
  /** Rate layers: cells with too few residents for a meaningful rate. */
  tooFewResidents: Map<CensusLevel, Set<string>>;
  /** Crime layers: cells with no Omaha Police coverage (Iowa side). */
  noData: Map<CensusLevel, Set<string>>;
  /** Upper bounds of 5 equal-count bands per level (quantile breaks). */
  breaks: Map<CensusLevel, number[]>;
  max: Map<CensusLevel, number>;
  /** Count layers: sum over every cell. Rate layers: the overall rate. */
  total: number;
}

const BAND_COUNT = 5;
const RATE_PER = 1000;

const emptyLevels = <T>(make: () => T): Map<CensusLevel, T> =>
  new Map(CENSUS_LEVELS.map((res: CensusLevel) => [res, make()]));

const parentAt = (cell: string, res: CensusLevel): string =>
  res === BASE_RES ? cell : cellToParent(cell, res);

/** Add a res-9 value into its cell at every level. */
function addUp(
  sums: Map<CensusLevel, Map<string, number>>,
  cell: string,
  value: number
): void {
  for (const res of CENSUS_LEVELS) {
    const level = sums.get(res)!;
    const target: string = parentAt(cell, res);
    level.set(target, (level.get(target) ?? 0) + value);
  }
}

/**
 * Residents per cell at every level: each block group's population spread
 * evenly over its res-9 cells (areal weighting at cell-centre precision),
 * then summed up to res 8 and 7. Built once.
 */
const POPULATION = (() => {
  const sums = emptyLevels(() => new Map<string, number>());
  for (const bg of BLOCK_GROUPS) {
    const share: number = bg.population / bg.cells.length;
    for (const cell of bg.cells) addUp(sums, cell, share);
  }
  return sums;
})();

/** Cells at every level with at least one res-9 child in OPD's county. */
const OPD_COVERED = (() => {
  const covered = emptyLevels(() => new Set<string>());
  for (const bg of BLOCK_GROUPS) {
    if (bg.county !== OPD_COUNTY) continue;
    for (const cell of bg.cells) {
      for (const res of CENSUS_LEVELS)
        covered.get(res)!.add(parentAt(cell, res));
    }
  }
  return covered;
})();

/** Crime counts per cell at every level for one filter. */
function crimeCounts(
  filter: CrimeFilter
): Map<CensusLevel, Map<string, number>> {
  const column: number = crimeColumn(filter);
  const sums = emptyLevels(() => new Map<string, number>());
  // Start every covered cell at 0 so crime-free areas still get a colour.
  for (const res of CENSUS_LEVELS) {
    for (const cell of OPD_COVERED.get(res)!) sums.get(res)!.set(cell, 0);
  }
  for (const [cell, counts] of Object.entries(CRIME_CELLS)) {
    if (counts[column] > 0) addUp(sums, cell, counts[column]);
  }
  return sums;
}

function quantileBreaks(values: Iterable<number>): {
  breaks: number[];
  max: number;
} {
  // Zeros (crime-free cells) would fill the lowest bands with "0–0", so
  // bands split the non-zero cells and bandOf() puts 0 in the first band.
  const sorted: number[] = [...values]
    .filter((v: number) => v > 0)
    .sort((a: number, b: number) => a - b);
  const breaks: number[] = Array.from(
    { length: BAND_COUNT },
    (_, i: number) =>
      sorted[
        Math.min(
          sorted.length - 1,
          Math.ceil(((i + 1) * sorted.length) / BAND_COUNT) - 1
        )
      ] ?? 0
  );
  return { breaks, max: sorted[sorted.length - 1] ?? 0 };
}

/** Build the values to colour for one dataset (and crime filter). */
export function buildHexLayer(
  dataset: CensusDataset,
  filter: CrimeFilter = DEFAULT_CRIME_FILTER
): HexLayer {
  const tooFewResidents = emptyLevels(() => new Set<string>());
  const noData = emptyLevels(() => new Set<string>());
  let values: Map<CensusLevel, Map<string, number>>;
  let incidentsByLevel: Map<CensusLevel, Map<string, number>> | null = null;
  let total = 0;

  if (dataset.id === CensusDatasetId.Population) {
    values = POPULATION;
    for (const v of POPULATION.get(BASE_RES)!.values()) total += v;
  } else {
    const counts = crimeCounts(filter);
    incidentsByLevel = counts;
    for (const res of CENSUS_LEVELS) {
      for (const cell of POPULATION.get(res)!.keys()) {
        if (!OPD_COVERED.get(res)!.has(cell)) noData.get(res)!.add(cell);
      }
    }
    if (dataset.kind === DatasetKind.Count) {
      values = counts;
      for (const v of counts.get(BASE_RES)!.values()) total += v;
    } else {
      values = emptyLevels(() => new Map<string, number>());
      for (const res of CENSUS_LEVELS) {
        for (const [cell, incidents] of counts.get(res)!) {
          const residents: number = POPULATION.get(res)!.get(cell) ?? 0;
          if (residents < RATE_MIN_RESIDENTS[res]) {
            tooFewResidents.get(res)!.add(cell);
          } else {
            values.get(res)!.set(cell, (RATE_PER * incidents) / residents);
          }
        }
      }
      // Overall rate across every covered res-9 cell.
      let incidents = 0;
      let residents = 0;
      for (const [cell, n] of counts.get(BASE_RES)!) {
        incidents += n;
        residents += POPULATION.get(BASE_RES)!.get(cell) ?? 0;
      }
      total = residents > 0 ? (RATE_PER * incidents) / residents : 0;
    }
  }

  const breaks = new Map<CensusLevel, number[]>();
  const max = new Map<CensusLevel, number>();
  for (const res of CENSUS_LEVELS) {
    const q = quantileBreaks(values.get(res)!.values());
    breaks.set(res, q.breaks);
    max.set(res, q.max);
  }
  return {
    dataset,
    filter,
    values,
    incidents: incidentsByLevel,
    tooFewResidents,
    noData,
    breaks,
    max,
    total
  };
}

export interface CellDetail {
  label: string;
  value: number;
}

/**
 * Extra numbers for the hover box: residents, and for crime datasets the
 * incidents by category (and the rate's inputs).
 */
export function cellDetails(layer: HexLayer, cell: string): CellDetail[] {
  const res = getResolution(cell) as CensusLevel;
  const residents: number = POPULATION.get(res)!.get(cell) ?? 0;
  if (!layer.dataset.usesCrimeFilter) return [];
  const details: CellDetail[] = [{ label: 'Residents', value: residents }];
  if (layer.noData.get(res)!.has(cell)) return details;
  const byCategory = new Map<string, number>();
  const columns: [string, number][] = [
    ...Object.values(CrimeCategory)
      .filter((c: CrimeCategory) => c !== CrimeCategory.All)
      .map((c: CrimeCategory): [string, number] => [
        CRIME_CATEGORY_LABEL[c],
        CRIME_COLUMN[c]
      ]),
    ['Non-criminal calls', CRIME_COLUMN.nonCriminal]
  ];
  for (const [child, counts] of Object.entries(CRIME_CELLS)) {
    if (parentAt(child, res) !== cell) continue;
    for (const [label, i] of columns) {
      byCategory.set(label, (byCategory.get(label) ?? 0) + counts[i]);
    }
  }
  details.push(
    {
      label: 'Incidents (filter)',
      value: layer.incidents?.get(res)!.get(cell) ?? 0
    },
    ...columns.map(([label]): CellDetail => ({
      label,
      value: byCategory.get(label) ?? 0
    }))
  );
  return details;
}

/** 0-based band (0–4) of a value at its level, for quantile colouring. */
export function bandOf(
  layer: HexLayer,
  res: CensusLevel,
  value: number
): number {
  const bounds: number[] = layer.breaks.get(res)!;
  const band: number = bounds.findIndex((upper: number) => value <= upper);
  return band === -1 ? bounds.length - 1 : band;
}

/** Every cell at `res` that has data (res 7: parents of the res-9 cells). */
export const cellsWithData = (layer: HexLayer, res: CensusLevel): string[] => [
  ...layer.values.get(res)!.keys()
];

/** GEOIDs of the block groups that contributed to a cell of any level. */
export function sourceBlockGroups(cell: string): string[] {
  const res = getResolution(cell) as CensusLevel;
  if (!SOURCES.has(res)) {
    const byCell = new Map<string, Set<string>>();
    for (const bg of BLOCK_GROUPS) {
      for (const child of bg.cells) {
        const target: string =
          res === BASE_RES ? child : cellToParent(child, res);
        let set = byCell.get(target);
        if (!set) byCell.set(target, (set = new Set<string>()));
        set.add(bg.geoid);
      }
    }
    SOURCES.set(
      res,
      new Map([...byCell].map(([c, set]) => [c, [...set].sort()]))
    );
  }
  return SOURCES.get(res)!.get(cell) ?? [];
}

/** A dataset value as text: whole counts with unit, or a one-decimal rate. */
export function formatValue(dataset: CensusDataset, value: number): string {
  if (dataset.kind === DatasetKind.Rate) {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${dataset.unit[1]}`;
  }
  const rounded: number = Math.round(value);
  return `${rounded.toLocaleString('en-US')} ${dataset.unit[rounded === 1 ? 0 : 1]}`;
}
