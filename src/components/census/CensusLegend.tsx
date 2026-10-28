'use client';

import If from '@/lib/If';
import { cn } from '@/lib/utils';
import {
  CENSUS_LEVEL_AREA_KM2,
  CENSUS_LEVEL_LABEL,
  CENSUS_SOURCE,
  CRIME_CATEGORY_LABEL,
  CRIME_SOURCE,
  CRIME_YEAR,
  RATE_MIN_RESIDENTS,
  CensusRamp,
  CrimeCategory,
  DatasetKind
} from '@/lib/census/hexData';
import {
  CENSUS_AUTO_LEVEL,
  CENSUS_THEME_OPACITY,
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

// globals.css sizes every li and p as body text, so items restate the size.
const ITEM_CLASS: string = 'flex items-center gap-1.5 text-fluid-xs';
const NOTE_CLASS: string = 'mt-0 text-fluid-xs leading-snug text-gray-40';

const SWATCH_CLASS: string =
  'inline-block size-3 shrink-0 rounded-xs ring-1 ring-gray-5/20';

/**
 * The swatch strip sits on the basemap's own colour and takes the map's fill
 * opacity, so each colour looks the way it does on the map.
 */
const BASEMAP_BACKDROP_CLASS: Record<'light' | 'dark', string> = {
  light: 'bg-gray-5',
  dark: 'bg-gray-90'
};

interface BandLabel {
  index: number;
  label: string;
}

/**
 * One label per band that can actually be drawn. Bands run (previous, upper],
 * so counts start one above the band below; a band whose upper bound repeats
 * the one below is empty and skipped.
 */
function bandLabels(breaks: number[], isRate: boolean): BandLabel[] {
  const format = (value: number): string =>
    isRate
      ? value.toLocaleString('en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        })
      : Math.round(value).toLocaleString('en-US');
  const labels: BandLabel[] = [];
  breaks.forEach((upper: number, index: number) => {
    if (index > 0 && upper <= breaks[index - 1]) return;
    const lower: number =
      index === 0
        ? 0
        : isRate
          ? breaks[index - 1] + 0.1
          : Math.round(breaks[index - 1]) + 1;
    const from: string = format(lower);
    const to: string = format(upper);
    labels.push({ index, label: from === to ? to : `${from}–${to}` });
  });
  return labels;
}

/** Colour key for the census fill at the level on screen, in plain words. */
export default function CensusLegend() {
  const {
    hexLayer,
    crimeFilter,
    currentLevel,
    levelMode,
    colorScale,
    opacity,
    isPanelOpen,
    basemap
  } = useCensusControls();
  const theme: 'light' | 'dark' = basemap.dark ? 'dark' : 'light';
  const { dataset } = hexLayer;
  const breaks: number[] = hexLayer.breaks.get(currentLevel) ?? [];
  const max: number = hexLayer.max.get(currentLevel) ?? 0;
  const isRate: boolean = dataset.kind === DatasetKind.Rate;
  const fillOpacity: number = Math.min(
    1,
    opacity * CENSUS_THEME_OPACITY[theme]
  );
  const ramp: string[] = BAND_SWATCH_CLASSES[dataset.ramp][theme];
  const bands: BandLabel[] = bandLabels(breaks, isRate);
  const maxLabel: string = isRate
    ? max.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : Math.round(max).toLocaleString('en-US');
  const crimeTypeLabel: string =
    crimeFilter.category === CrimeCategory.All && crimeFilter.includeNonCriminal
      ? `${CRIME_CATEGORY_LABEL[CrimeCategory.All]} + non-criminal calls`
      : CRIME_CATEGORY_LABEL[crimeFilter.category];
  const subject: string = dataset.usesCrimeFilter
    ? `${crimeTypeLabel} · ${CRIME_YEAR}`
    : '2020 Census';
  const area: number = CENSUS_LEVEL_AREA_KM2[currentLevel];

  return (
    // Slides past the open control panel (w-64 = 16rem) from sm up.
    <div
      className={cn(
        'census-legend absolute bottom-fixed-xs left-fixed-xs z-[600] flex w-80 max-w-[calc(100%-2*var(--spacing-fixed-xs))] flex-col gap-fixed-2xs rounded-md bg-gray-90/90 px-fixed-xs py-fixed-2xs text-fluid-xs text-gray-30 shadow-md transition-transform duration-200 ease-out motion-reduce:transition-none',
        isPanelOpen &&
          'sm:max-w-[calc(100%-16rem-2*var(--spacing-fixed-xs))] sm:translate-x-64'
      )}
    >
      <div className="flex flex-col">
        <span className="font-poppins font-semibold text-gray-5">
          {dataset.legendTitle}
        </span>
        <span className="text-gray-30">{subject}</span>
        <span className="text-gray-40">
          {CENSUS_LEVEL_LABEL[currentLevel]} hexagons, about{' '}
          {area < 1 ? area.toFixed(2) : area.toFixed(1)} km² each
          {levelMode === CENSUS_AUTO_LEVEL
            ? ' · zoom to change the size'
            : ' · size set in Controls'}
        </span>
      </div>

      <If
        condition={colorScale === CensusColorScale.Bands}
        then={
          <div className="flex flex-col gap-1">
            <ol
              className={cn(
                'grid gap-px overflow-hidden rounded-xs p-px',
                BASEMAP_BACKDROP_CLASS[theme]
              )}
              style={{ gridTemplateColumns: `repeat(${bands.length}, 1fr)` }}
            >
              {bands.map(({ index }: BandLabel) => (
                <li key={index} className="h-3">
                  <i
                    className={cn('block size-full', ramp[index])}
                    style={{ opacity: fillOpacity }}
                  />
                </li>
              ))}
            </ol>
            <ol
              className="grid gap-px text-center tabular-nums"
              style={{ gridTemplateColumns: `repeat(${bands.length}, 1fr)` }}
            >
              {bands.map(({ index, label }: BandLabel) => (
                <li key={index} className="text-fluid-xs leading-tight">
                  {label}
                </li>
              ))}
            </ol>
          </div>
        }
        else={
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                'block h-3 overflow-hidden rounded-xs p-px',
                BASEMAP_BACKDROP_CLASS[theme]
              )}
            >
              <i
                className={cn(
                  'block size-full',
                  GRADIENT_CLASS[dataset.ramp][theme]
                )}
                style={{ opacity: fillOpacity }}
              />
            </span>
            <span className="flex justify-between tabular-nums">
              <span>0</span>
              <span>{maxLabel}</span>
            </span>
          </div>
        }
      />
      <span className="flex justify-between text-gray-40">
        <span>◀ {dataset.scaleEnds[0]}</span>
        <span>{dataset.scaleEnds[1]} ▶</span>
      </span>
      <p className={NOTE_CLASS}>
        <If
          condition={colorScale === CensusColorScale.Bands}
          then="Each colour holds about a fifth of the hexagons with data."
          else={
            <If
              condition={colorScale === CensusColorScale.Sqrt}
              then="Square-root scale: small values are spread out so they're easier to tell apart."
              else="Linear scale: colour grows in step with the value."
            />
          }
        />
        <If condition={isRate}>
          {' '}
          Rate = {CRIME_YEAR} incidents ÷ 2020 residents × 1,000.
        </If>
      </p>

      <If condition={dataset.usesCrimeFilter}>
        <ul className="flex flex-col gap-1 border-t border-stroke-secondary pt-fixed-2xs">
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
              Grey: fewer than{' '}
              {RATE_MIN_RESIDENTS[currentLevel].toLocaleString('en-US')}{' '}
              residents, so no rate is shown
            </li>
          </If>
          <li className={ITEM_CLASS}>
            <i
              className={cn(
                SWATCH_CLASS,
                PLACEHOLDER_SWATCH_CLASS[CensusCellStatus.NoData][theme]
              )}
            />
            Dashed: outside Omaha Police coverage (Council Bluffs)
          </li>
        </ul>
      </If>

      {/* The full source strings are long; the short form stays one line. */}
      <span
        title={dataset.usesCrimeFilter ? CRIME_SOURCE : CENSUS_SOURCE}
        className="border-t border-stroke-secondary pt-fixed-2xs text-gray-40"
      >
        {dataset.source}
      </span>
    </div>
  );
}
