'use client';

import { useEffect, type ComponentType } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import SimulationSection from '@/components/modules/controls/SimulationSection';
import MapSection from '@/components/modules/controls/MapSection';
import DemandSection from '@/components/modules/controls/DemandSection';
import { useControls } from '@/components/providers/ControlsProvider';

export const CONTROL_PANEL_ID: string = 'control-panel';

interface ControlSection {
  id: string;
  title: string;
  Content: ComponentType;
}

/** Drawer sections in display order; a new section is one entry here. */
const CONTROL_SECTIONS: ControlSection[] = [
  { id: 'simulation', title: 'Simulation', Content: SimulationSection },
  { id: 'map', title: 'Map', Content: MapSection },
  { id: 'demand', title: 'Demand', Content: DemandSection }
];

/** Hideable drawer over the left edge of the god map holding every control. */
export default function ControlPanel() {
  const { isPanelOpen, setIsPanelOpen } = useControls();

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, setIsPanelOpen]);

  return (
    // Above the map overlays (z-600) and Leaflet controls (z-1000). Stepper
    // and Legend shift past it through the `panel-open` variant (globals.css).
    <aside
      id={CONTROL_PANEL_ID}
      aria-label="Controls"
      hidden={!isPanelOpen}
      className="control-panel absolute inset-y-0 left-0 z-[1100] flex w-64 animate-slide-in flex-col overflow-y-auto border-r border-stroke-secondary bg-gray-90/95 text-fluid-s text-gray-10 shadow-lg motion-reduce:animate-none"
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
      {CONTROL_SECTIONS.map(({ id, title, Content }: ControlSection) => (
        <section
          key={id}
          aria-labelledby={`control-section-${id}`}
          className="flex flex-col gap-fixed-2xs border-b border-stroke-secondary p-fixed-xs last:border-b-0"
        >
          <h3
            id={`control-section-${id}`}
            className="font-inter text-fluid-xs font-semibold tracking-widest text-gray-30 uppercase"
          >
            {title}
          </h3>
          <Content />
        </section>
      ))}
    </aside>
  );
}
