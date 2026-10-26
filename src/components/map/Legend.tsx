import type { DriverState } from '@/lib/sim/types';

const STATE_SWATCH: Record<DriverState, string> = {
  idle: 'bg-teal-50',
  offered: 'bg-yellow-40',
  toPickup: 'bg-blue-50',
  onTrip: 'bg-orange-50'
};

const LEGEND_STATES: { state: DriverState; label: string }[] = [
  { state: 'idle', label: 'Available' },
  { state: 'offered', label: 'Reviewing offer' },
  { state: 'toPickup', label: 'To pickup' },
  { state: 'onTrip', label: 'On trip' }
];

/** Static key for car colors and category tags on the god map. */
export default function Legend() {
  return (
    // Slides past the open control panel (w-64 = 16rem) from sm up and
    // narrows to the map width that is left.
    <div className="legend absolute bottom-fixed-xs left-fixed-xs z-[600] flex max-w-[calc(100%-2*var(--spacing-fixed-xs))] flex-wrap gap-x-fixed-xs gap-y-1 rounded-md bg-gray-90/90 px-fixed-xs py-1.5 text-fluid-xs text-gray-30 transition-transform sm:panel-open:max-w-[calc(100%-16rem-2*var(--spacing-fixed-xs))] sm:panel-open:translate-x-64">
      {LEGEND_STATES.map(({ state, label }) => (
        <span key={state}>
          <i
            className={`sw ${state} mr-1.5 inline-block size-2.5 rounded-xs align-[-1px] ${STATE_SWATCH[state]}`}
            data-state={state}
          />
          {label}
        </span>
      ))}
      <span className="cats">
        X · P · C · XL = UberX · Priority · Comfort · UberXL
      </span>
      <span className="flex items-center gap-1.5">
        Demand low
        {/* Mirrors HEAT_RAMP_TOKENS in mapView.ts */}
        <i className="inline-block h-2.5 w-12 rounded-xs bg-linear-to-r from-yellow-30 via-yellow-60 to-orange-90" />
        high
      </span>
      <span>Click a car for details</span>
    </div>
  );
}
