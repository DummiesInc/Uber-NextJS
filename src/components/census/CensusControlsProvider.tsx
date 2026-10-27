'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  CENSUS_DATASETS,
  CENSUS_LEVELS,
  CensusDatasetId,
  CrimeCategory,
  DEFAULT_CRIME_FILTER,
  buildHexLayer,
  type CensusDataset,
  type CrimeFilter,
  type CensusLevel,
  type HexLayer
} from '@/lib/census/hexData';
import { BASEMAPS, type Basemap } from '@/components/map/basemaps';
import {
  CENSUS_AUTO_LEVEL,
  CensusColorScale,
  type CensusLevelMode
} from '@/components/census/censusMapView';

interface PersistedSetting<T> {
  key: string;
  fallback: T;
  /** Saved string -> value, or undefined to fall back. */
  parse: (saved: string) => T | undefined;
  serialize: (value: T) => string;
}

/**
 * State mirrored to localStorage. The census shell renders client-only
 * (next/dynamic, ssr: false), so reading storage in the initializer can't
 * cause a hydration mismatch and avoids building the map twice.
 */
function usePersistedSetting<T>({
  key,
  fallback,
  parse,
  serialize
}: PersistedSetting<T>): [T, (value: T) => void] {
  const [setting, setSettingState] = useState<T>(() => {
    try {
      const saved: string | null = localStorage.getItem(key);
      return saved === null ? fallback : (parse(saved) ?? fallback);
    } catch {
      return fallback;
    }
  });
  const setSetting = useCallback(
    (value: T) => {
      setSettingState(value);
      try {
        localStorage.setItem(key, serialize(value));
      } catch {
        // Storage blocked: the setting just won't be remembered.
      }
    },
    [key, serialize]
  );
  return [setting, setSetting];
}

const parseBoolean = (saved: string): boolean => saved === 'true';

const PANEL_OPEN_SETTING: PersistedSetting<boolean> = {
  key: 'mini-uber.census.panel-open.v1',
  fallback: true,
  parse: parseBoolean,
  serialize: String
};

const DATASET_SETTING: PersistedSetting<CensusDatasetId> = {
  key: 'mini-uber.census.dataset.v1',
  fallback: CensusDatasetId.Population,
  parse: (saved: string) =>
    CENSUS_DATASETS.find((dataset: CensusDataset) => dataset.id === saved)?.id,
  serialize: String
};

const CRIME_CATEGORY_SETTING: PersistedSetting<CrimeCategory> = {
  key: 'mini-uber.census.crime-category.v1',
  fallback: DEFAULT_CRIME_FILTER.category,
  parse: (saved: string) =>
    Object.values(CrimeCategory).find(
      (category: CrimeCategory) => category === saved
    ),
  serialize: String
};

const INCLUDE_NON_CRIMINAL_SETTING: PersistedSetting<boolean> = {
  key: 'mini-uber.census.include-non-criminal.v1',
  fallback: DEFAULT_CRIME_FILTER.includeNonCriminal,
  parse: parseBoolean,
  serialize: String
};

const LEVEL_MODE_SETTING: PersistedSetting<CensusLevelMode> = {
  key: 'mini-uber.census.level-mode.v1',
  fallback: CENSUS_AUTO_LEVEL,
  parse: (saved: string) =>
    CENSUS_LEVELS.find((res: CensusLevel) => String(res) === saved),
  serialize: String
};

const COLOR_SCALE_SETTING: PersistedSetting<CensusColorScale> = {
  key: 'mini-uber.census.color-scale.v1',
  fallback: CensusColorScale.Bands,
  parse: (saved: string) =>
    Object.values(CensusColorScale).find(
      (scale: CensusColorScale) => scale === saved
    ),
  serialize: String
};

export const CENSUS_OPACITY_MIN: number = 0.2;
export const CENSUS_OPACITY_MAX: number = 1;

const OPACITY_SETTING: PersistedSetting<number> = {
  key: 'mini-uber.census.opacity.v1',
  fallback: 0.5,
  parse: (saved: string) => {
    const opacity: number = Number(saved);
    return opacity >= CENSUS_OPACITY_MIN && opacity <= CENSUS_OPACITY_MAX
      ? opacity
      : undefined;
  },
  serialize: String
};

const HEX_OUTLINES_SETTING: PersistedSetting<boolean> = {
  key: 'mini-uber.census.hex-outlines.v1',
  fallback: true,
  parse: parseBoolean,
  serialize: String
};

const BLOCK_GROUP_OUTLINES_SETTING: PersistedSetting<boolean> = {
  key: 'mini-uber.census.block-group-outlines.v1',
  fallback: false,
  parse: parseBoolean,
  serialize: String
};

const BASEMAP_SETTING: PersistedSetting<Basemap> = {
  key: 'mini-uber.census.basemap.v1',
  fallback: BASEMAPS[0],
  parse: (saved: string) =>
    BASEMAPS.find((basemap: Basemap) => basemap.name === saved),
  serialize: (basemap: Basemap) => basemap.name
};

interface CensusControlsContextValue {
  isPanelOpen: boolean;
  setIsPanelOpen: (isOpen: boolean) => void;
  datasetId: CensusDatasetId;
  setDatasetId: (id: CensusDatasetId) => void;
  /** Which incidents the crime datasets count; ignored for population. */
  crimeFilter: CrimeFilter;
  setCrimeCategory: (category: CrimeCategory) => void;
  setIncludeNonCriminal: (isIncluded: boolean) => void;
  /** The selected dataset spread over every level; rebuilt on dataset or filter change. */
  hexLayer: HexLayer;
  levelMode: CensusLevelMode;
  setLevelMode: (mode: CensusLevelMode) => void;
  /** The level the map is showing, reported by CensusMapView; not persisted. */
  currentLevel: CensusLevel;
  setCurrentLevel: (level: CensusLevel) => void;
  colorScale: CensusColorScale;
  setColorScale: (scale: CensusColorScale) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  isHexOutlinesVisible: boolean;
  setIsHexOutlinesVisible: (isVisible: boolean) => void;
  isBlockGroupOutlinesVisible: boolean;
  setIsBlockGroupOutlinesVisible: (isVisible: boolean) => void;
  basemap: Basemap;
  setBasemap: (basemap: Basemap) => void;
}

interface CensusControlsProviderProps {
  children: ReactNode;
}

const CensusControlsContext = createContext<CensusControlsContextValue | null>(
  null
);

/** Every census page setting; CensusMap applies them to its CensusMapView. */
export default function CensusControlsProvider({
  children
}: CensusControlsProviderProps) {
  const [isPanelOpen, setIsPanelOpen] =
    usePersistedSetting<boolean>(PANEL_OPEN_SETTING);
  const [datasetId, setDatasetId] =
    usePersistedSetting<CensusDatasetId>(DATASET_SETTING);
  const [crimeCategory, setCrimeCategory] = usePersistedSetting<CrimeCategory>(
    CRIME_CATEGORY_SETTING
  );
  const [includeNonCriminal, setIncludeNonCriminal] =
    usePersistedSetting<boolean>(INCLUDE_NON_CRIMINAL_SETTING);
  const [levelMode, setLevelMode] =
    usePersistedSetting<CensusLevelMode>(LEVEL_MODE_SETTING);
  const [colorScale, setColorScale] =
    usePersistedSetting<CensusColorScale>(COLOR_SCALE_SETTING);
  const [opacity, setOpacity] = usePersistedSetting<number>(OPACITY_SETTING);
  const [isHexOutlinesVisible, setIsHexOutlinesVisible] =
    usePersistedSetting<boolean>(HEX_OUTLINES_SETTING);
  const [isBlockGroupOutlinesVisible, setIsBlockGroupOutlinesVisible] =
    usePersistedSetting<boolean>(BLOCK_GROUP_OUTLINES_SETTING);
  const [basemap, setBasemap] = usePersistedSetting<Basemap>(BASEMAP_SETTING);
  // CensusMapView reports the real level as soon as it mounts.
  const [currentLevel, setCurrentLevel] = useState<CensusLevel>(8);

  const crimeFilter: CrimeFilter = useMemo<CrimeFilter>(
    () => ({ category: crimeCategory, includeNonCriminal }),
    [crimeCategory, includeNonCriminal]
  );

  const hexLayer: HexLayer = useMemo<HexLayer>(
    () =>
      buildHexLayer(
        CENSUS_DATASETS.find(
          (dataset: CensusDataset) => dataset.id === datasetId
        ) ?? CENSUS_DATASETS[0],
        crimeFilter
      ),
    [datasetId, crimeFilter]
  );

  const contextValue = useMemo<CensusControlsContextValue>(
    () => ({
      isPanelOpen,
      setIsPanelOpen,
      datasetId,
      setDatasetId,
      crimeFilter,
      setCrimeCategory,
      setIncludeNonCriminal,
      hexLayer,
      levelMode,
      setLevelMode,
      currentLevel,
      setCurrentLevel,
      colorScale,
      setColorScale,
      opacity,
      setOpacity,
      isHexOutlinesVisible,
      setIsHexOutlinesVisible,
      isBlockGroupOutlinesVisible,
      setIsBlockGroupOutlinesVisible,
      basemap,
      setBasemap
    }),
    [
      isPanelOpen,
      setIsPanelOpen,
      datasetId,
      setDatasetId,
      crimeFilter,
      setCrimeCategory,
      setIncludeNonCriminal,
      hexLayer,
      levelMode,
      setLevelMode,
      currentLevel,
      colorScale,
      setColorScale,
      opacity,
      setOpacity,
      isHexOutlinesVisible,
      setIsHexOutlinesVisible,
      isBlockGroupOutlinesVisible,
      setIsBlockGroupOutlinesVisible,
      basemap,
      setBasemap
    ]
  );

  return (
    <CensusControlsContext.Provider value={contextValue}>
      {children}
    </CensusControlsContext.Provider>
  );
}

export function useCensusControls(): CensusControlsContextValue {
  const controls = useContext(CensusControlsContext);
  if (!controls) {
    throw new Error(
      'useCensusControls must be used inside CensusControlsProvider'
    );
  }
  return controls;
}
