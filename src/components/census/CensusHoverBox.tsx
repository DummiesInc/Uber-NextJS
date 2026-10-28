import { cellArea, UNITS } from 'h3-js';
import { Info } from 'lucide-react';
import If from '@/lib/If';
import {
  CENSUS_LEVEL_LABEL,
  CRIME_YEAR,
  DatasetKind,
  RATE_MIN_RESIDENTS,
  formatValue,
  rankAtLevel,
  type CellDetail,
  type HexLayer
} from '@/lib/census/hexData';
import {
  CensusCellStatus,
  type CensusCellHover
} from '@/components/census/censusMapView';

interface CensusHoverBoxProps {
  cellHover: CensusCellHover | null;
  hexLayer: HexLayer;
}

/** cellDetails rows that aren't part of the by-type breakdown. */
const RESIDENTS_DETAIL: string = 'Residents';
const FILTERED_TOTAL_DETAIL: string = 'Incidents (filter)';

// globals.css sizes every p, li and dd as body text, so rows restate the size.
const ROW_CLASS: string = 'flex justify-between gap-fixed-2xs text-fluid-xs';
const MUTED_CLASS: string = 'text-gray-30';
const SECTION_CLASS: string =
  'flex flex-col gap-0.5 border-t border-stroke-secondary pt-1.5';

const formatCount = (value: number): string =>
  Math.round(value).toLocaleString('en-US');

/** "More than 80% of neighbourhood hexagons", or a plainer line at the ends. */
function rankLine(rank: number, value: number, levelLabel: string): string {
  const hexagons = `${levelLabel.toLowerCase()} hexagons`;
  if (value === 0) return `None recorded · tied lowest of ${hexagons}`;
  const percent: number = Math.round(rank * 100);
  if (percent >= 99) return `Among the highest 1% of ${hexagons}`;
  if (percent < 1) return `Among the lowest of ${hexagons}`;
  return `Higher than ${percent}% of ${hexagons}`;
}

/** Readout for the census hexagon under the cursor, in plain words. */
export default function CensusHoverBox({
  cellHover,
  hexLayer
}: CensusHoverBoxProps) {
  const { dataset } = hexLayer;
  const status: CensusCellStatus = cellHover?.status ?? CensusCellStatus.Value;
  const levelLabel: string = cellHover ? CENSUS_LEVEL_LABEL[cellHover.res] : '';
  const areaKm2: number = cellHover ? cellArea(cellHover.cell, UNITS.km2) : 0;
  const value: number = cellHover?.value ?? 0;
  const isRate: boolean = dataset.kind === DatasetKind.Rate;
  const details: CellDetail[] = cellHover?.details ?? [];
  const residents: number | undefined = details.find(
    (detail: CellDetail) => detail.label === RESIDENTS_DETAIL
  )?.value;
  const filteredIncidents: number | undefined = details.find(
    (detail: CellDetail) => detail.label === FILTERED_TOTAL_DETAIL
  )?.value;
  const byType: CellDetail[] = details.filter(
    (detail: CellDetail) =>
      detail.label !== RESIDENTS_DETAIL &&
      detail.label !== FILTERED_TOTAL_DETAIL
  );
  const blockGroupCount: number = dataset.usesCrimeFilter
    ? 0
    : (cellHover?.blockGroups.length ?? 0);

  return (
    <If condition={cellHover}>
      {/* Top-right, left of the zoom control (30px + 10px Leaflet margin), so
          it never meets the bottom-left legend however short the window. */}
      <div
        id="census-hover"
        className="census-hover pointer-events-none absolute top-fixed-2xs right-fixed-10xl z-[600] flex w-72 max-w-[calc(100%-var(--spacing-fixed-10xl)-var(--spacing-fixed-2xs))] flex-col gap-1.5 rounded-md bg-gray-90/90 px-fixed-xs py-fixed-2xs text-fluid-xs leading-normal text-gray-10 shadow-md"
      >
        <div className="flex items-baseline justify-between gap-fixed-2xs">
          <span className="font-poppins font-semibold text-gray-5">
            {levelLabel} hexagon
          </span>
          <span className={MUTED_CLASS}>
            ~{areaKm2 < 1 ? areaKm2.toFixed(2) : areaKm2.toFixed(1)} km²
          </span>
        </div>

        <If condition={status === CensusCellStatus.Value}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-fixed-2xs">
              <span className="font-poppins text-fluid-m font-semibold text-gray-5 tabular-nums">
                {formatValue(dataset, value)}
              </span>
              <If condition={!isRate && areaKm2 > 0}>
                <span className={`${MUTED_CLASS} tabular-nums`}>
                  ≈ {formatCount(value / areaKm2)} per km²
                </span>
              </If>
            </div>
            <span className={MUTED_CLASS}>
              {rankLine(
                cellHover ? rankAtLevel(hexLayer, cellHover.res, value) : 0,
                value,
                levelLabel
              )}
            </span>
          </div>
        </If>
        <If condition={status !== CensusCellStatus.Value}>
          <p className="mt-0 flex items-start gap-1.5 rounded-xs bg-gray-80 px-fixed-2xs py-1 text-fluid-xs text-gray-10">
            <Info
              className="mt-0.5 size-3 shrink-0 text-yellow-40"
              aria-hidden
            />
            <If
              condition={status === CensusCellStatus.TooFewResidents}
              then={`Fewer than ${formatCount(
                cellHover ? RATE_MIN_RESIDENTS[cellHover.res] : 0
              )} people live here, so a rate would be misleading.`}
              else="Outside Omaha Police coverage (Council Bluffs), so there's no crime data."
            />
          </p>
        </If>

        <If condition={dataset.usesCrimeFilter && residents !== undefined}>
          <div className={SECTION_CLASS}>
            <span className={ROW_CLASS}>
              <span className={MUTED_CLASS}>People living here</span>
              <span className="tabular-nums">
                {formatCount(residents ?? 0)}
              </span>
            </span>
            <If condition={isRate && filteredIncidents !== undefined}>
              <span className={ROW_CLASS}>
                <span className={MUTED_CLASS}>Incidents ({CRIME_YEAR})</span>
                <span className="tabular-nums">
                  {formatCount(filteredIncidents ?? 0)}
                </span>
              </span>
            </If>
          </div>
        </If>
        <If condition={byType.length > 0}>
          <div className={SECTION_CLASS}>
            <span className="text-gray-30">By type, {CRIME_YEAR}</span>
            {byType.map(({ label, value: count }: CellDetail) => (
              <span key={label} className={ROW_CLASS}>
                <span className={MUTED_CLASS}>{label}</span>
                <span className="tabular-nums">{formatCount(count)}</span>
              </span>
            ))}
          </div>
        </If>
        <If condition={blockGroupCount > 0}>
          <span className={MUTED_CLASS}>
            Estimated from {blockGroupCount} census block group
            {blockGroupCount === 1 ? '' : 's'}
          </span>
        </If>

        <span className="truncate border-t border-stroke-secondary pt-1.5 font-mono text-gray-40">
          H3 {cellHover?.cell}
          <If condition={cellHover?.parent}> · parent {cellHover?.parent}</If>
        </span>
      </div>
    </If>
  );
}
