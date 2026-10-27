import If from '@/lib/If';
import type { HeatLevel } from '@/lib/sim/heat';
import type { CellBreadcrumb, CellHoverInfo } from '@/components/map/mapView';

interface CellInfoProps {
  cellHover: CellHoverInfo | null;
}

/** Matches the Grid level options in MapSection. */
const LEVEL_NAME: Record<HeatLevel, string> = {
  7: 'city',
  8: 'dispatch',
  9: 'street'
};

const TERM_CLASS: string = 'text-gray-30';
// Globals size bare li/dd at body size, so they restate the overlay's size.
const VALUE_CLASS: string = 'text-right text-fluid-xs tabular-nums';

/** Hover readout for the H3 cell under the cursor at the level on screen. */
export default function CellInfo({ cellHover }: CellInfoProps) {
  return (
    <If condition={cellHover}>
      <div
        id="cellinfo"
        className="cellinfo pointer-events-none absolute right-fixed-xs bottom-fluid-2xl z-[600] flex w-72 flex-col gap-1.5 rounded-md bg-gray-90/90 px-fixed-2xs py-fluid-2xs text-fluid-xs leading-normal text-gray-10"
      >
        <div className="flex items-baseline justify-between gap-fixed-2xs">
          <span className="font-poppins font-semibold text-gray-5">
            Res {cellHover?.res} · {cellHover ? LEVEL_NAME[cellHover.res] : ''}
          </span>
          <code className="font-mono text-gray-30">{cellHover?.cell}</code>
        </div>
        <ol className="cellinfo-breadcrumb flex flex-wrap items-center gap-1 font-mono text-gray-30">
          {cellHover?.breadcrumb.map(
            ({ res, cell }: CellBreadcrumb, index: number) => (
              <li key={res} className="flex items-center gap-1 text-fluid-xs">
                <If condition={index > 0}>
                  <span aria-hidden="true">›</span>
                </If>
                <span
                  className={
                    res === cellHover.res
                      ? 'rounded-xs bg-blue-60/30 px-1 text-gray-5'
                      : 'rounded-xs bg-gray-80 px-1'
                  }
                >
                  r{res} {cell.slice(0, 7)}…
                </span>
              </li>
            )
          )}
        </ol>
        <dl className="grid grid-cols-[auto_1fr] gap-x-fixed-2xs gap-y-0.5">
          <dt className={TERM_CLASS}>Parent</dt>
          <dd className="text-right font-mono text-fluid-xs">
            <If condition={cellHover?.parent} else="none (top level)">
              {cellHover?.parent}
            </If>
          </dd>
          <dt className={TERM_CLASS}>Children</dt>
          <dd className={VALUE_CLASS}>
            {cellHover?.children} cell{cellHover?.children === 1 ? '' : 's'}
          </dd>
          <dt className={TERM_CLASS}>Demand</dt>
          <dd className={VALUE_CLASS}>{cellHover?.demand.toFixed(2)}</dd>
          <dt className={TERM_CLASS}>Share</dt>
          <dd className={VALUE_CLASS}>
            {Math.round((cellHover?.share ?? 0) * 100)}%{' '}
            <span className="text-gray-30">of busiest</span>
          </dd>
          <dt className={TERM_CLASS}>Drivers here</dt>
          <dd className={VALUE_CLASS}>{cellHover?.driversHere}</dd>
          <dt className={TERM_CLASS}>Dispatch cells occupied</dt>
          <dd className={VALUE_CLASS}>{cellHover?.occupiedCells}</dd>
        </dl>
      </div>
    </If>
  );
}
