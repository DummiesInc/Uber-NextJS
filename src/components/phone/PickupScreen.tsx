import { ChevronRight, Crosshair, Lock, MapPin, Shuffle } from 'lucide-react';
import { DESTINATION } from '@/lib/sim/config';
import { LOCATIONS } from '@/lib/sim/data/locations';
import { haversine } from '@/lib/sim/geo';
import type { Place } from '@/lib/sim/types';
import type { PhoneState } from '@/hooks/usePhone';

interface PickupScreenProps extends Pick<PhoneState, 'places'> {
  onChoosePlace: (place: Place) => void;
  onShuffle: () => void;
  onChooseOnMap: () => void;
}

/** First screen: pick one of five pickup spots; the destination is fixed. */
export default function PickupScreen({
  places,
  onChoosePlace,
  onShuffle,
  onChooseOnMap
}: PickupScreenProps) {
  return (
    <>
      <h2 className="mb-fixed-2xs text-fluid-l">Where are you?</h2>
      <div className="where mb-fixed-xs rounded-fluid-xs bg-surface-secondary px-fixed-xs py-fixed-2xs">
        <div className="where-row flex items-center gap-fixed-2xs">
          <span className="dot-pick size-2.5 flex-none rounded-full bg-surface-alternate" />
          <span className="muted flex-1 text-fg-secondary">
            Choose your pickup below
          </span>
        </div>
        <div className="where-line my-0.75 ml-1 h-fixed-s w-0.5 bg-gray-30" />
        <div className="where-row flex items-center gap-fixed-2xs">
          <span className="sq-dest size-2.5 flex-none bg-surface-alternate" />
          <span className="flex-1">
            <b>{DESTINATION.name}</b>
            <small className="block text-fluid-xs text-fg-secondary">
              {DESTINATION.address}
            </small>
          </span>
          <span className="lock" title="Destination is fixed">
            <Lock className="size-3.5 text-fg-secondary" aria-hidden />
          </span>
        </div>
      </div>
      <button
        type="button"
        className="choose-on-map mb-fixed-2xs flex w-full cursor-pointer items-center gap-fixed-xs rounded-fluid-xs border border-gray-10 px-fixed-2xs py-fixed-2xs text-left leading-snug text-fg-primary hover:bg-surface-secondary"
        onClick={onChooseOnMap}
      >
        <span className="pin grid size-fixed-6xl flex-none place-items-center rounded-full bg-surface-alternate text-fg-alternate">
          <Crosshair className="size-4" aria-hidden />
        </span>
        <span className="flex-1">
          <b>Choose on map</b>
          <small className="block text-fluid-xs text-fg-secondary">
            Drop a pin at your exact spot
          </small>
        </span>
        <ChevronRight className="chev size-5 text-gray-30" aria-hidden />
      </button>
      <ul className="places">
        {places.map((place: Place) => (
          <li key={place.name} className="text-fluid-s leading-snug">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-fixed-xs border-b border-gray-10 px-1 py-fixed-2xs text-left text-fg-primary hover:bg-surface-secondary"
              data-idx={LOCATIONS.indexOf(place)}
              onClick={() => onChoosePlace(place)}
            >
              <span className="pin grid size-fixed-6xl flex-none place-items-center rounded-full bg-surface-secondary">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="pl-text flex-1">
                <b>{place.name}</b>
                <small className="block text-fluid-xs text-fg-secondary">
                  {place.area} ·{' '}
                  {(haversine(place, DESTINATION) / 1000).toFixed(1)} km to
                  destination
                </small>
              </span>
              <ChevronRight className="chev size-5 text-gray-30" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="link mt-fixed-2xs flex cursor-pointer items-center gap-1.5 py-1.5 font-semibold text-blue-60"
        onClick={onShuffle}
      >
        <Shuffle className="size-4" aria-hidden />
        Show 5 other places
      </button>
    </>
  );
}
