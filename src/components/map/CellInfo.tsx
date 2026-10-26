import If from '@/lib/If';
import { H3_RES } from '@/lib/sim/config';
import type { CellHoverInfo } from '@/components/map/mapView';

interface CellInfoProps {
  cellHover: CellHoverInfo | null;
}

/** Hover readout for the H3 cell under the cursor on the god map. */
export default function CellInfo({ cellHover }: CellInfoProps) {
  return (
    <If condition={cellHover}>
      <div
        id="cellinfo"
        className="cellinfo pointer-events-none absolute right-fixed-xs bottom-fixed-8xl z-[600] rounded-md bg-gray-90/90 px-fixed-2xs py-fluid-2xs text-fluid-xs leading-normal text-gray-10"
      >
        <b>H3 cell</b> <code className="font-mono">{cellHover?.cell}</code>
        <br />
        res {H3_RES} · {cellHover?.driversHere} driver
        {cellHover?.driversHere === 1 ? '' : 's'} in this cell ·{' '}
        {cellHover?.occupiedCells} cells occupied
      </div>
    </If>
  );
}
