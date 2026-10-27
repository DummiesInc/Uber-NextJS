'use client';

import If from '@/lib/If';
import { cn } from '@/lib/utils';
import {
  CENSUS_SOURCE,
  CRIME_CATEGORY_LABEL,
  CRIME_SOURCE,
  CRIME_YEAR,
  CensusRamp,
  CrimeCategory,
  DatasetKind
} from '@/lib/census/hexData';
import {
  CensusCellStatus,
  CensusColorScale
} from '@/components/census/censusMapView';
import { useCensusControls } from '@/components/census/CensusControlsProvider';

/**
 * Mirrors CENSUS_RAMP_TOKENS in censusMapView.ts, low to high; dark basemaps
 * run each ramp reversed.
 */
const BAND_SWATCH_CLASSES: Record<
  CensusRamp,
  Record<'light' | 'dark', string[]>
> = {
  [CensusRamp.Population]: {
    light: [
      'bg-teal-20',
      'bg-teal-40',
      'bg-blue-40',
      'bg-blue-60',
      'bg-blue-80'
    ],
    dark: ['bg-blue-80', 'bg-blue-60', 'bg-blue-40', 'bg-teal-40', 'bg-teal-20']
  },
  [CensusRamp.Crime]: {
    light: [
      'bg-yellow-20',
      'bg-yellow-50',
      'bg-orange-50',
      'bg-orange-70',
      'bg-orange-90'
    ],
    dark: [
      'bg-orange-90',
      'bg-orange-70',
      'bg-orange-50',
      'bg-yellow-50',
      'bg-yellow-20'
    ]
  }
};

/** Every ramp stop, so the key matches the map's stop-to-stop blend. */
const GRADIENT_CLASS: Record<CensusRamp, Record<'light' | 'dark', string>> = {
  [CensusRamp.Population]: {
    light:
      'bg-[linear-gradient(to_right,var(--color-teal-20),var(--color-teal-40),var(--color-blue-40),var(--color-blue-60),var(--color-blue-80))]',
    dark: 'bg-[linear-gradient(to_right,var(--color-blue-80),var(--color-blue-60),var(--color-blue-40),var(--color-teal-40),var(--color-teal-20))]'
  },
  [CensusRamp.Crime]: {
    light:
      'bg-[linear-gradient(to_right,var(--color-yellow-20),var(--color-yellow-50),var(--color-orange-50),var(--color-orange-70),var(--color-orange-90))]',
    dark: 'bg-[linear-gradient(to_right,var(--color-orange-90),var(--color-orange-70),var(--color-orange-50),var(--color-yellow-50),var(--color-yellow-20))]'
  }
};

/**
 * Mirrors CENSUS_PLACEHOLDER_STYLE in censusMapView.ts: token + fill opacity,
 * and the dashed outline for "no data". Replaces SWATCH_CLASS's ring.
 */
const PLACEHOLDER_SWATCH_CLASS: Record<
  Exclude<CensusCellStatus, CensusCellStatus.Value>,
  Record<'light' | 'dark', string>
> = {
  [CensusCellStatus.TooFewResidents]: {
    light: 'bg-gray-30/65 ring-gray-5/20',
    dark: 'bg-gray-50/80 ring-gray-5/20'
  },
  [CensusCellStatus.NoData]: {
    light: 'border border-dashed border-gray-40/60 bg-gray-50/8 ring-0',
    dark: 'border border-dashed border-gray-20/60 bg-gray-20/8 ring-0'
  }
};

// globals.css sizes every li as body text, so items restate the legend size.
const ITEM_CLASS: string =
  'flex items-center gap-1.5 text-fluid-xs whitespace-nowrap';

const SWATCH_CLASS: string =
  'inline-block size-3 shrink-0 rounded-xs ring-1 ring-gray-5/20';

/** Colour key for the census fill at the level on screen, plus the source. */
export default function CensusLegend() {
  const {
    hexLayer,
    crimeFilter,
    currentLevel,
    colorScale,
    isPanelOpen,
    basemap
  } = useCensusControls();
  const theme: 'light' | 'dark' = basemap.dark ? 'dark' : 'light';
  const { dataset } = hexLayer;
  const breaks: number[] = hexLayer.breaks.get(currentLevel) ?? [];
  const max: number = hexLayer.max.get(currentLevel) ?? 0;
  const isRate: boolean = dataset.kind === DatasetKind.Rate;
  // Bare numbers, not hexData's formatValue: the unit is in the title.
  const formatNumber = (value: number): string =>
    isRate
      ? value.toLocaleString('en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        })
      : Math.round(value).toLocaleString('en-US');
  const crimeTypeLabel: string =
    crimeFilter.category === CrimeCategory.All && crimeFilter.includeNonCriminal
      ? `${CRIME_CATEGORY_LABEL[CrimeCategory.All]} + non-criminal calls`
      : CRIME_CATEGORY_LABEL[crimeFilter.category];

  return (
    // Slides past the open control panel (w-64 = 16rem) from sm up.
    <div
      className={cn(
        'census-legend absolute bottom-fixed-xs left-fixed-xs z-[600] flex max-w-[calc(100%-2*var(--spacing-fixed-xs))] flex-col gap-1.5 rounded-md bg-gray-90/90 px-fixed-xs py-fixed-2xs text-fluid-xs text-gray-30 shadow-md transition-transform duration-200 ease-out motion-reduce:transition-none',
        isPanelOpen &&
          'sm:max-w-[calc(100%-16rem-2*var(--spacing-fixed-xs))] sm:translate-x-64'
      )}
    >
      {/* Long crime titles wrap between their parts, never mid-part. */}
      <span className="flex flex-wrap gap-x-1 font-semibold text-gray-10">
        <span>{dataset.label}</span>
        <If condition={dataset.usesCrimeFilter}>
          <span className="whitespace-nowrap">· {crimeTypeLabel}</span>
        </If>
        <span className="whitespace-nowrap">· res {currentLevel} cells</span>
      </span>
      <If
        condition={colorScale === CensusColorScale.Bands}
        then={
          <ol className="flex flex-wrap gap-x-fixed-xs gap-y-1 tabular-nums">
            {breaks.map((upper: number, index: number) => (
              <li key={index} className={ITEM_CLASS}>
                <i
                  className={cn(
                    SWATCH_CLASS,
                    BAND_SWATCH_CLASSES[dataset.ramp][theme][index]
                  )}
                />
                {index === 0
                  ? `≤ ${formatNumber(upper)}`
                  : `${formatNumber(breaks[index - 1])}–${formatNumber(upper)}`}
              </li>
            ))}
          </ol>
        }
        else={
          <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums">
            0
            <i
              className={cn(
                'inline-block h-3 w-32 shrink rounded-xs ring-1 ring-gray-5/20',
                GRADIENT_CLASS[dataset.ramp][theme]
              )}
            />
            {formatNumber(max)}
            <If condition={colorScale === CensusColorScale.Sqrt}>
              <span>(√ scale)</span>
            </If>
          </span>
        }
      />
      <If condition={dataset.usesCrimeFilter}>
        <ul className="flex flex-wrap gap-x-fixed-xs gap-y-1 border-t border-stroke-secondary pt-1.5">
          <If condition={isRate}>
            <li className={ITEM_CLASS}>
              <i
                className={cn(
                  SWATCH_CLASS,
                  PLACEHOLDER_SWATCH_CLASS[CensusCellStatus.TooFewResidents][
                    theme
                  ]
                )}
              />
              Too few residents
            </li>
          </If>
          <li className={ITEM_CLASS}>
            <i
              className={cn(
                SWATCH_CLASS,
                PLACEHOLDER_SWATCH_CLASS[CensusCellStatus.NoData][theme]
              )}
            />
            No data (outside OPD)
          </li>
        </ul>
      </If>
      <If condition={isRate}>
        <span className="text-gray-40">
          {CRIME_YEAR} incidents ÷ 2020 residents
        </span>
      </If>
      {/* The full source strings are long; the short form stays one line. */}
      <span
        title={dataset.usesCrimeFilter ? CRIME_SOURCE : CENSUS_SOURCE}
        className="text-gray-40"
      >
        {dataset.source}
      </span>
    </div>
  );
}
