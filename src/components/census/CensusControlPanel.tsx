'use client';

import { useEffect, type ChangeEvent, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import If from '@/lib/If';
import { cn } from '@/lib/utils';
import {
  CENSUS_DATASETS,
  CENSUS_LEVELS,
  CRIME_CATEGORY_LABEL,
  CrimeCategory,
  type CensusDataset,
  type CensusDatasetId,
  type CensusLevel
} from '@/lib/census/hexData';
import { BASEMAPS, type Basemap } from '@/components/map/basemaps';
import {
  CENSUS_AUTO_LEVEL,
  CENSUS_LEVEL_NAME,
  CensusColorScale
} from '@/components/census/censusMapView';
import {
  CENSUS_OPACITY_MAX,
  CENSUS_OPACITY_MIN,
  useCensusControls
} from '@/components/census/CensusControlsProvider';
import {
  CONTROL_CLASS,
  RANGE_CLASS,
  SELECT_CLASS
} from '@/components/modules/controls/controlClasses';

export const CENSUS_CONTROL_PANEL_ID: string = 'census-control-panel';

const CHECKBOX_CLASS: string = 'size-3.5 cursor-pointer accent-teal-60';

interface ColorScaleOption {
  scale: CensusColorScale;
  label: string;
}

const COLOR_SCALE_OPTIONS: ColorScaleOption[] = [
  { scale: CensusColorScale.Bands, label: 'Bands (quantile)' },
  { scale: CensusColorScale.Linear, label: 'Linear' },
  { scale: CensusColorScale.Sqrt, label: 'Square root' }
];

interface CensusControlSection {
  id: string;
  title: string;
  content: ReactNode;
}

/** Hideable drawer over the left edge of the census map holding every control. */
export default function CensusControlPanel() {
  const {
    isPanelOpen,
    setIsPanelOpen,
    datasetId,
    setDatasetId,
    hexLayer,
    crimeFilter,
    setCrimeCategory,
    setIncludeNonCriminal,
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
  } = useCensusControls();

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, setIsPanelOpen]);

  const handleLevelModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const level: CensusLevel | undefined = CENSUS_LEVELS.find(
      (res: CensusLevel) => String(res) === event.target.value
    );
    setLevelMode(level ?? CENSUS_AUTO_LEVEL);
  };

  const handleBasemapChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextBasemap: Basemap | undefined = BASEMAPS.find(
      (option: Basemap) => option.name === event.target.value
    );
    if (nextBasemap) setBasemap(nextBasemap);
  };

  /** Drawer sections in display order; a new section is one entry here. */
  const sections: CensusControlSection[] = [
    {
      id: 'data',
      title: 'Data',
      content: (
        <>
          <label className={cn(CONTROL_CLASS, 'whitespace-nowrap')}>
            Dataset
            <select
              className={cn(SELECT_CLASS, 'min-w-0')}
              value={datasetId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setDatasetId(event.target.value as CensusDatasetId)
              }
            >
              {CENSUS_DATASETS.map((dataset: CensusDataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.label}
                </option>
              ))}
            </select>
          </label>
          <If condition={hexLayer.dataset.usesCrimeFilter}>
            <label className={cn(CONTROL_CLASS, 'whitespace-nowrap')}>
              Crime type
              <select
                className={cn(SELECT_CLASS, 'min-w-0')}
                value={crimeFilter.category}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setCrimeCategory(event.target.value as CrimeCategory)
                }
              >
                {Object.values(CrimeCategory).map((category: CrimeCategory) => (
                  <option key={category} value={category}>
                    {CRIME_CATEGORY_LABEL[category]}
                  </option>
                ))}
              </select>
            </label>
            <If condition={crimeFilter.category === CrimeCategory.All}>
              <label
                className={CONTROL_CLASS}
                title="Adds police calls that aren't crimes: sickness, overdoses, deaths, injuries, lost property…"
              >
                <input
                  type="checkbox"
                  role="switch"
                  className={CHECKBOX_CLASS}
                  checked={crimeFilter.includeNonCriminal}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setIncludeNonCriminal(event.target.checked)
                  }
                />
                Include non-criminal calls
              </label>
              <p className="-mt-1 px-fixed-2xs text-fluid-xs text-gray-30">
                Sickness, overdoses, deaths, injuries, lost property…
              </p>
            </If>
          </If>
          <label className={cn(CONTROL_CLASS, 'whitespace-nowrap')}>
            Grid level
            <select
              className={cn(SELECT_CLASS, 'min-w-0 tabular-nums')}
              value={String(levelMode)}
              onChange={handleLevelModeChange}
            >
              <option value={CENSUS_AUTO_LEVEL}>
                Auto · res {currentLevel}
              </option>
              {CENSUS_LEVELS.map((res: CensusLevel) => (
                <option key={res} value={String(res)}>
                  Res {res} · {CENSUS_LEVEL_NAME[res]}
                </option>
              ))}
            </select>
          </label>
        </>
      )
    },
    {
      id: 'style',
      title: 'Style',
      content: (
        <>
          <label className={cn(CONTROL_CLASS, 'whitespace-nowrap')}>
            Colour scale
            <select
              className={cn(SELECT_CLASS, 'min-w-0')}
              value={colorScale}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setColorScale(event.target.value as CensusColorScale)
              }
            >
              {COLOR_SCALE_OPTIONS.map(({ scale, label }: ColorScaleOption) => (
                <option key={scale} value={scale}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={CONTROL_CLASS}>
            Opacity
            <input
              type="range"
              className={cn(RANGE_CLASS, 'accent-teal-60')}
              min={CENSUS_OPACITY_MIN}
              max={CENSUS_OPACITY_MAX}
              step={0.05}
              value={opacity}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setOpacity(Number(event.target.value))
              }
            />
            <span className="w-8 text-right tabular-nums">
              {Math.round(opacity * 100)}%
            </span>
          </label>
          <label className={CONTROL_CLASS}>
            <input
              type="checkbox"
              role="switch"
              className={CHECKBOX_CLASS}
              checked={isHexOutlinesVisible}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setIsHexOutlinesVisible(event.target.checked)
              }
            />
            Hex outlines
          </label>
          <label className={CONTROL_CLASS}>
            <input
              type="checkbox"
              role="switch"
              className={CHECKBOX_CLASS}
              checked={isBlockGroupOutlinesVisible}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setIsBlockGroupOutlinesVisible(event.target.checked)
              }
            />
            Block-group outlines
          </label>
        </>
      )
    },
    {
      id: 'map',
      title: 'Map',
      content: (
        <label className={CONTROL_CLASS}>
          Basemap
          <select
            className={SELECT_CLASS}
            value={basemap.name}
            onChange={handleBasemapChange}
          >
            {BASEMAPS.map((option: Basemap) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )
    }
  ];

  return (
    // Above the map overlays (z-600) and Leaflet controls (z-1000).
    <aside
      id={CENSUS_CONTROL_PANEL_ID}
      aria-label="Census controls"
      hidden={!isPanelOpen}
      className="census-control-panel absolute inset-y-0 left-0 z-[1100] flex w-64 animate-slide-in flex-col overflow-y-auto border-r border-stroke-secondary bg-gray-90/95 text-fluid-s text-gray-10 shadow-lg motion-reduce:animate-none"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-fixed-2xs border-b border-stroke-secondary bg-gray-90 py-fixed-2xs pr-fixed-2xs pl-fixed-xs">
        <h2 className="flex items-center gap-fixed-2xs text-fluid-m text-fg-alternate">
          <SlidersHorizontal className="size-4 text-fg-accent" aria-hidden />
          Controls
        </h2>
        <button
          type="button"
          aria-label="Close controls"
          onClick={() => setIsPanelOpen(false)}
          className="cursor-pointer rounded-md p-1.5 text-gray-30 hover:bg-gray-80 hover:text-gray-10 focus-visible:outline-2 focus-visible:outline-stroke-focus"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {sections.map(({ id, title, content }: CensusControlSection) => (
        <section
          key={id}
          aria-labelledby={`census-control-section-${id}`}
          className="flex flex-col gap-fixed-2xs border-b border-stroke-secondary p-fixed-xs last:border-b-0"
        >
          <h3
            id={`census-control-section-${id}`}
            className="font-inter text-fluid-xs font-semibold tracking-widest text-gray-30 uppercase"
          >
            {title}
          </h3>
          {content}
        </section>
      ))}
    </aside>
  );
}
