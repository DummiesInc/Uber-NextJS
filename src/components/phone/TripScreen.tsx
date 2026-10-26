import If from '@/lib/If';
import { DESTINATION } from '@/lib/sim/config';
import type { Driver } from '@/lib/sim/driver';
import DriverCard from '@/components/phone/DriverCard';
import type { LiveTripProgress } from '@/components/phone/Phone';

interface TripScreenProps {
  driver: Driver;
  liveTrip: LiveTripProgress | null;
}

/** Rider on board, heading to the fixed destination. */
export default function TripScreen({ driver, liveTrip }: TripScreenProps) {
  return (
    <>
      <h2 className="mb-fixed-2xs text-fluid-l">
        Heading to {DESTINATION.name}
      </h2>
      <div className="live-eta mb-fluid-2xs min-h-fixed-2xl text-fluid-m">
        <If condition={liveTrip}>
          <b>{liveTrip?.minutes} min</b> · {liveTrip?.remainingKm} km left ·
          arrive{' '}
          {new Date(
            Date.now() + (liveTrip?.remainingS ?? 0) * 1000
          ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </If>
      </div>
      <div className="progress mb-fixed-s h-1.5 overflow-hidden rounded-xs bg-gray-10">
        {/* Runtime-computed width stays inline. */}
        <div
          className="bar h-full w-0 bg-surface-alternate transition-[width] duration-250 ease-linear"
          style={{ width: `${liveTrip?.percent ?? 0}%` }}
        />
      </div>
      <DriverCard driver={driver} />
      <div className="trip-line my-fixed-2xs">
        <small className="block text-fluid-xs text-fg-secondary">
          {DESTINATION.address}
        </small>
      </div>
    </>
  );
}
