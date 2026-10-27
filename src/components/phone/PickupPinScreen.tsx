import { ArrowLeft, MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import If from '@/lib/If';
import { LOCATIONS } from '@/lib/sim/data/locations';
import { haversine } from '@/lib/sim/geo';
import { SERVICE_SET, toCell } from '@/lib/sim/grid';
import type { LatLng, Place } from '@/lib/sim/types';
import Button from '@/components/atoms/Button';

interface PickupPinScreenProps {
  center: LatLng;
  onConfirm: (place: Place) => void;
  onBack: () => void;
}

/** Pin-drop pickup: the map above is aimed by the rider; this is the confirm bar. */
export default function PickupPinScreen({
  center,
  onConfirm,
  onBack
}: PickupPinScreenProps) {
  const isInService: boolean = SERVICE_SET.has(toCell(center));
  const nearestPlace: Place = LOCATIONS.reduce((best: Place, place: Place) =>
    haversine(place, center) < haversine(best, center) ? place : best
  );
  const droppedPin: Place = {
    name: 'Dropped pin',
    area: `near ${nearestPlace.name}`,
    lat: center.lat,
    lng: center.lng
  };

  return (
    <>
      <div className="pin-bar-top flex items-center gap-fixed-xs">
        {/* 34px visual, widened to a ~42px hit area by the pseudo-element. */}
        <button
          type="button"
          className="icon-btn relative grid size-fixed-6xl flex-none cursor-pointer place-items-center rounded-full bg-surface-secondary before:absolute before:-inset-1 before:content-[''] hover:bg-surface-tertiary"
          aria-label="Back to pickup list"
          onClick={onBack}
        >
          <ArrowLeft className="size-4.5" aria-hidden />
        </button>
        <div
          className={cn(
            'pin-label min-w-0 flex-1 rounded-fluid-xs px-fixed-xs py-1.5 leading-snug',
            isInService ? 'bg-surface-secondary' : 'bg-orange-5'
          )}
        >
          <span className="block text-fluid-xs font-semibold tracking-wide text-fg-secondary uppercase">
            Pickup
          </span>
          <If
            condition={isInService}
            then={
              <>
                <b className="block font-poppins text-fluid-m">
                  {droppedPin.name}
                </b>
                <small className="block truncate text-fluid-xs text-fg-secondary">
                  {droppedPin.area}
                </small>
              </>
            }
            else={
              <>
                <b className="flex items-center gap-1 font-poppins text-fluid-m text-fg-error">
                  <MapPinOff className="size-4 flex-none" aria-hidden />
                  Outside service area
                </b>
                <small className="block text-fluid-xs text-fg-secondary">
                  Move the map to a spot in Omaha
                </small>
              </>
            }
          />
        </div>
      </div>
      <Button
        className="mt-fixed-xs"
        disabled={!isInService}
        onClick={() => onConfirm(droppedPin)}
      >
        Confirm pickup
      </Button>
    </>
  );
}
