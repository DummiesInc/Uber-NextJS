import { Info } from 'lucide-react';
import If from '@/lib/If';
import { cn } from '@/lib/utils';
import {
  RATE_MIN_RESIDENTS,
  formatValue,
  type CellDetail,
  type CensusDataset
} from '@/lib/census/hexData';
import {
  CENSUS_BAND_COUNT,
  CENSUS_LEVEL_NAME,
  CensusCellStatus,
  type CensusCellHover
} from '@/components/census/censusMapView';

interface CensusHoverBoxProps {
  cellHover: CensusCellHover | null;
  dataset: CensusDataset;
}

/** Block groups listed by GEOID before the rest collapse into "+N more". */
const MAX_LISTED_BLOCK_GROUPS: number = 4;

/**
 * cellDetails lists Residents and the filtered total first, then the
 * per-category breakdown; a divider marks where the breakdown starts.
 */
const DETAIL_BREAKDOWN_START: number = 2;

// The grid has no column gap, so row dividers run unbroken; terms pad instead.
const TERM_CLASS: string = 'pr-fixed-2xs text-fluid-xs text-gray-30';
const VALUE_CLASS: string = 'text-right text-fluid-xs tabular-nums';
const DIVIDER_CLASS: string = 'mt-1 border-t border-stroke-secondary pt-1';
// Placeholder cells read as a status note, not a value: muted, italic, icon.
const STATUS_CLASS: string = 'text-right text-fluid-xs text-gray-30 italic';
const STATUS_ICON_CLASS: string = 'mr-1 inline-block size-3 align-middle';

/** Readout for the census cell under the cursor at the level on screen. */
export default function CensusHoverBox({
  cellHover,
  dataset
}: CensusHoverBoxProps) {
  const status: CensusCellStatus = cellHover?.status ?? CensusCellStatus.Value;
  const minResidents: number = cellHover
    ? RATE_MIN_RESIDENTS[cellHover.res]
    : 0;
  const blockGroups: string[] = dataset.usesCrimeFilter
    ? []
    : (cellHover?.blockGroups ?? []);
  const hiddenBlockGroupCount: number =
    blockGroups.length - MAX_LISTED_BLOCK_GROUPS;

  return (
    <If condition={cellHover}>
      {/* Top-right, left of the zoom control (30px + 10px Leaflet margin), so
          it never meets the bottom-left legend however short the window. */}
      <div
        id="census-hover"
        className="census-hover pointer-events-none absolute top-fixed-2xs right-fixed-10xl z-[600] flex w-72 max-w-[calc(100%-var(--spacing-fixed-10xl)-var(--spacing-fixed-2xs))] flex-col gap-1.5 rounded-md bg-gray-90/90 px-fixed-xs py-fixed-2xs text-fluid-xs leading-normal text-gray-10 shadow-md"
      >
        <div className="flex items-baseline justify-between gap-fixed-2xs border-b border-stroke-secondary pb-1.5">
          <span className="font-poppins font-semibold text-gray-5">
            Res {cellHover?.res} ·{' '}
            {cellHover ? CENSUS_LEVEL_NAME[cellHover.res] : ''}
          </span>
          <code className="truncate font-mono text-gray-30">
            {cellHover?.cell}
          </code>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-y-0.5">
          <dt className={TERM_CLASS}>Parent</dt>
          <dd className="text-right font-mono text-fluid-xs">
            <If condition={cellHover?.parent} else="none (top level)">
              {cellHover?.parent}
            </If>
          </dd>
          <If condition={status === CensusCellStatus.Value}>
            <dt className={TERM_CLASS}>Value</dt>
            <dd className={VALUE_CLASS}>
              {formatValue(dataset, cellHover?.value ?? 0)}
            </dd>
            <dt className={TERM_CLASS}>Band</dt>
            <dd className={VALUE_CLASS}>
              band {(cellHover?.band ?? 0) + 1} of {CENSUS_BAND_COUNT}
            </dd>
            <dt className={TERM_CLASS}>Share</dt>
            <dd className={VALUE_CLASS}>
              {Math.round((cellHover?.share ?? 0) * 100)}%{' '}
              <span className="text-gray-30">of highest cell</span>
            </dd>
          </If>
          <If condition={status === CensusCellStatus.TooFewResidents}>
            <dt className={TERM_CLASS}>Status</dt>
            <dd className={STATUS_CLASS}>
              <Info className={STATUS_ICON_CLASS} aria-hidden />
              Fewer than {minResidents.toLocaleString('en-US')} residents, rate
              not shown
            </dd>
          </If>
          <If condition={status === CensusCellStatus.NoData}>
            <dt className={TERM_CLASS}>Status</dt>
            <dd className={STATUS_CLASS}>
              <Info className={STATUS_ICON_CLASS} aria-hidden />
              No data: outside Omaha Police coverage
            </dd>
          </If>
          {(cellHover?.details ?? []).map(
            ({ label, value }: CellDetail, index: number) => (
              <div key={label} className="contents">
                <dt
                  className={cn(
                    TERM_CLASS,
                    index === DETAIL_BREAKDOWN_START && DIVIDER_CLASS
                  )}
                >
                  {label}
                </dt>
                <dd
                  className={cn(
                    VALUE_CLASS,
                    index === DETAIL_BREAKDOWN_START && DIVIDER_CLASS
                  )}
                >
                  {Math.round(value).toLocaleString('en-US')}
                </dd>
              </div>
            )
          )}
          <If condition={blockGroups.length > 0}>
            <dt className={TERM_CLASS}>Block groups</dt>
            <dd className="flex flex-col items-end font-mono text-fluid-xs">
              {blockGroups
                .slice(0, MAX_LISTED_BLOCK_GROUPS)
                .map((geoid: string) => (
                  <span key={geoid}>{geoid}</span>
                ))}
              <If condition={hiddenBlockGroupCount > 0}>
                <span className="font-inter text-gray-30">
                  +{hiddenBlockGroupCount} more
                </span>
              </If>
            </dd>
          </If>
        </dl>
      </div>
    </If>
  );
}
