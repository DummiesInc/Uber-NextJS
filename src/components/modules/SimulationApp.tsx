'use client';

import SimulationProvider from '@/components/providers/SimulationProvider';
import ControlsProvider from '@/components/providers/ControlsProvider';
import TopBar from '@/components/modules/TopBar';
import ControlPanel from '@/components/modules/ControlPanel';
import GodMap from '@/components/map/GodMap';
import Stepper from '@/components/map/Stepper';
import Legend from '@/components/map/Legend';
import DispatchFeed from '@/components/map/DispatchFeed';
import Phone from '@/components/phone/Phone';

interface SimulationAppProps {
  llmEnabled: boolean;
}

/** Page layout: god-view map and feed on the left, rider phone on the right. */
export default function SimulationApp({ llmEnabled }: SimulationAppProps) {
  return (
    <SimulationProvider llmEnabled={llmEnabled}>
      <ControlsProvider>
        <div className="app grid min-h-screen grid-cols-1 bg-surface-alternate text-gray-10 lg:h-screen lg:grid-cols-[minmax(0,1fr)_440px]">
          {/* Map row keeps a usable floor on short viewports; 190px feed per the original. */}
          <section className="left grid h-screen min-w-0 grid-rows-[auto_minmax(320px,1fr)_190px] border-r border-stroke-secondary py-0 lg:h-auto lg:min-h-0">
            <TopBar />
            <div className="map-wrap relative min-h-0">
              <GodMap />
              <Stepper />
              <Legend />
              <ControlPanel />
            </div>
            <DispatchFeed />
          </section>
          <section className="right grid place-items-center overflow-auto bg-[radial-gradient(circle_at_50%_30%,var(--color-gray-80),var(--color-surface-alternate))] p-fixed-m">
            {/* 390×844 iPhone frame; no tokens at device-mockup scale, arbitrary by design */}
            <div className="phone relative h-[780px] w-[390px] rounded-fluid-2xl bg-surface-alternate p-fixed-xs shadow-[0_0_0_2px_var(--color-gray-80),0_30px_60px_rgb(0_0_0/0.6)] lg:h-[min(844px,calc(100vh-32px))]">
              <div className="notch absolute top-fixed-l left-1/2 z-[1000] h-fixed-5xl w-[110px] -translate-x-1/2 rounded-fluid-xl bg-surface-alternate" />
              <Phone />
            </div>
          </section>
        </div>
      </ControlsProvider>
    </SimulationProvider>
  );
}
