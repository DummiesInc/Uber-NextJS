'use client';

import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValue } from '@/lib/census/hexData';
import CensusControlsProvider, {
  useCensusControls
} from '@/components/census/CensusControlsProvider';
import CensusControlPanel, {
  CENSUS_CONTROL_PANEL_ID
} from '@/components/census/CensusControlPanel';
import CensusMap from '@/components/census/CensusMap';
import CensusLegend from '@/components/census/CensusLegend';
import {
  CONTROL_CLASS,
  ICON_CLASS
} from '@/components/modules/controls/controlClasses';

/** Title plus the button that opens and closes the census control panel. */
function CensusTopBar() {
  const { isPanelOpen, setIsPanelOpen, hexLayer } = useCensusControls();

  return (
    <header className="census-topbar flex items-center justify-between gap-fixed-xs border-b border-stroke-secondary bg-gray-90 px-fixed-m py-fixed-2xs">
      <div className="flex min-w-0 items-baseline gap-fixed-2xs">
        <h1 className="text-fluid-l whitespace-nowrap text-fg-alternate">
          Census on H3
        </h1>
        <span className="truncate text-fluid-s text-gray-30">
          Omaha · Council Bluffs ·{' '}
          {formatValue(hexLayer.dataset, hexLayer.total)}
        </span>
      </div>
      <button
        type="button"
        className={cn(
          CONTROL_CLASS,
          'shrink-0 aria-expanded:border-stroke-alternate aria-expanded:bg-surface-primary aria-expanded:font-semibold aria-expanded:text-fg-primary'
        )}
        aria-expanded={isPanelOpen}
        aria-controls={CENSUS_CONTROL_PANEL_ID}
        onClick={() => setIsPanelOpen(!isPanelOpen)}
      >
        <SlidersHorizontal className={ICON_CLASS} aria-hidden />
        Controls
      </button>
    </header>
  );
}

/** Census page layout: top bar over a full-height map with its overlays. */
export default function CensusApp() {
  return (
    <CensusControlsProvider>
      {/* minmax(0,1fr) column: the nowrap title can't widen the page. */}
      <div className="census-app grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-surface-alternate text-gray-10">
        <CensusTopBar />
        <div className="census-map-wrap relative min-h-0">
          <CensusMap />
          <CensusLegend />
          <CensusControlPanel />
        </div>
      </div>
    </CensusControlsProvider>
  );
}
