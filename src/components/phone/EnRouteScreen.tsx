import If from '@/lib/If';
import type { Driver } from '@/lib/sim/driver';
import type { Ride } from '@/lib/sim/types';
import Button from '@/components/atoms/Button';
import DriverCard from '@/components/phone/DriverCard';
import type { LiveTripProgress } from '@/components/phone/Phone';

interface EnRouteScreenProps {
  driver: Driver;
  ride: Ride;
  liveTrip: LiveTripProgress | null;
  onCancel: () => void;
}

/** Driver heading to the pickup, then waiting there. */
export default function EnRouteScreen({
  driver,
  ride,
  liveTrip,
  onCancel
}: EnRouteScreenProps) {
  const driverArrived: boolean = ride.status === 'driverArrived';
  const progressPercent: number = driverArrived
    ? 100
    : (liveTrip?.percent ?? 0);

  return (
    <>
      <h2 className="mb-fixed-2xs text-fluid-l">
        <If
          condition={driverArrived}
          then="Your driver is here"
          else={`${driver.name} is on the way`}
        />
      </h2>
      <div className="live-eta mb-fluid-2xs min-h-fixed-2xl text-fluid-m">
        <If
          condition={driverArrived}
          then={`Meet ${driver.name} at ${ride.pickup.name}`}
          else={
            <If condition={liveTrip}>
              Arriving in <b>{liveTrip?.minutes} min</b> ·{' '}
              {liveTrip?.remainingKm} km away
            </If>
          }
        />
      </div>
      <div className="progress mb-fixed-s h-1.5 overflow-hidden rounded-xs bg-gray-10">
        {/* Runtime-computed width stays inline. */}
        <div
          className="bar h-full w-0 bg-surface-alternate transition-[width] duration-250 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <DriverCard driver={driver} />
      <If condition={!driverArrived}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel ride
        </Button>
      </If>
    </>
  );
}
