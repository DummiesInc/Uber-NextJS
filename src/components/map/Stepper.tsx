'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import If from '@/lib/If';
import type { SimEvent } from '@/lib/sim/events';
import { useSimEvent } from '@/components/providers/SimulationProvider';

const RIDE_STEPS: string[] = [
  'Requested',
  'Matched',
  'Driver en route',
  'Picked up',
  'On trip',
  'Dropped off'
];

/** Ride lifecycle overlay on the god map; hidden while no ride is active. */
export default function Stepper() {
  const [activeStep, setActiveStep] = useState<number>(-1);

  useSimEvent((event: SimEvent) => {
    switch (event.type) {
      case 'ride_requested':
        return setActiveStep(0);
      case 'offer_result':
        if (event.outcome === 'accepted') setActiveStep(1);
        return;
      case 'driver_assigned':
        return setActiveStep(2);
      case 'driver_arrived':
        return setActiveStep(3);
      case 'picked_up':
        return setActiveStep(4);
      case 'dropped_off':
        return setActiveStep(6);
      case 'reset':
      case 'ride_cancelled':
        return setActiveStep(-1);
    }
  });

  return (
    <If condition={activeStep >= 0}>
      <ol
        id="stepper"
        className="stepper absolute top-fixed-xs left-14 z-[600] flex gap-1 rounded-full bg-gray-90/90 p-1.5 shadow-lg"
      >
        {RIDE_STEPS.map((label: string, index: number) => (
          <li
            key={label}
            data-i={index}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-fixed-2xs py-1 text-fluid-xs leading-none text-gray-30',
              index < activeStep && 'done text-gray-10',
              index === activeStep &&
                'active bg-surface-primary font-semibold text-fg-primary'
            )}
          >
            <span
              className={cn(
                'dot size-2 rounded-full bg-gray-60',
                index < activeStep && 'bg-surface-success',
                index === activeStep && 'animate-pulse-dot bg-surface-accent'
              )}
            />
            {label}
          </li>
        ))}
      </ol>
    </If>
  );
}
