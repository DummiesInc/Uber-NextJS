'use client';

import { SlidersHorizontal } from 'lucide-react';
import { CONTROL_PANEL_ID } from '@/components/modules/ControlPanel';
import { cn } from '@/lib/utils';
import { useControls } from '@/components/providers/ControlsProvider';
import {
  CONTROL_CLASS,
  ICON_CLASS
} from '@/components/modules/controls/controlClasses';

/** Brand plus the button that opens and closes the control panel. */
export default function TopBar() {
  const { isPanelOpen, setIsPanelOpen } = useControls();

  return (
    <header className="topbar flex items-center justify-between gap-fixed-xs border-b border-stroke-secondary bg-gray-90 px-fixed-m py-fixed-2xs">
      <div className="brand flex min-w-0 items-baseline gap-fixed-2xs">
        <h1 className="text-fluid-l whitespace-nowrap text-fg-alternate">
          Take me to work
        </h1>
        <span className="truncate text-fluid-s text-gray-30">
          Omaha · H3 res 8 dispatch simulator
        </span>
      </div>
      <button
        type="button"
        className={cn(
          CONTROL_CLASS,
          'shrink-0 aria-expanded:border-stroke-alternate aria-expanded:bg-surface-primary aria-expanded:font-semibold aria-expanded:text-fg-primary'
        )}
        aria-expanded={isPanelOpen}
        aria-controls={CONTROL_PANEL_ID}
        onClick={() => setIsPanelOpen(!isPanelOpen)}
      >
        <SlidersHorizontal className={ICON_CLASS} aria-hidden />
        Controls
      </button>
    </header>
  );
}
