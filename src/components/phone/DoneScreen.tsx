import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DESTINATION } from '@/lib/sim/config';
import type { Driver } from '@/lib/sim/driver';
import type { Ride } from '@/lib/sim/types';
import Button from '@/components/atoms/Button';
import DriverCard from '@/components/phone/DriverCard';
import type { PhoneState } from '@/components/phone/Phone';

const STAR_VALUES: number[] = [1, 2, 3, 4, 5];

interface DoneScreenProps extends Pick<PhoneState, 'rating'> {
  driver: Driver;
  ride: Ride;
  onRate: (stars: number) => void;
  onRideAgain: () => void;
}

/** Trip summary, rating and "Ride again". */
export default function DoneScreen({
  driver,
  ride,
  rating,
  onRate,
  onRideAgain
}: DoneScreenProps) {
  return (
    <>
      <h2 className="mb-fixed-2xs text-fluid-l">You&apos;ve arrived 🎉</h2>
      <p className="muted text-fluid-s leading-snug text-fg-secondary">
        {DESTINATION.address}
      </p>
      <div className="summary my-fixed-xs grid grid-cols-3 gap-fluid-2xs">
        <div className="rounded-lg bg-surface-secondary p-fixed-2xs text-center">
          <small className="block text-fluid-xs text-fg-secondary">Fare</small>
          <b className="text-fluid-m">${ride.fare.toFixed(2)}</b>
        </div>
        <div className="rounded-lg bg-surface-secondary p-fixed-2xs text-center">
          <small className="block text-fluid-xs text-fg-secondary">
            Distance
          </small>
          <b className="text-fluid-m">
            {(ride.route.distanceM / 1000).toFixed(1)} km
          </b>
        </div>
        <div className="rounded-lg bg-surface-secondary p-fixed-2xs text-center">
          <small className="block text-fluid-xs text-fg-secondary">Time</small>
          <b className="text-fluid-m">
            {Math.round(ride.route.durationS / 60)} min
          </b>
        </div>
      </div>
      <DriverCard driver={driver} />
      <div className="rate my-fixed-s text-center">
        <small className="block text-fluid-xs text-fg-secondary">
          How was your ride with {driver.name}?
        </small>
        <div>
          {STAR_VALUES.map((stars: number) => (
            <button
              key={stars}
              type="button"
              className={cn(
                'star cursor-pointer px-0.75 text-gray-20',
                stars <= rating && 'on text-yellow-50'
              )}
              data-stars={stars}
              aria-label={`${stars} star${stars > 1 ? 's' : ''}`}
              onClick={() => onRate(stars)}
            >
              <Star className="size-fixed-5xl fill-current" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <Button onClick={onRideAgain}>Ride again</Button>
    </>
  );
}
