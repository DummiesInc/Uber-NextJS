'use client';

import { type ReactNode } from 'react';
import { BatteryFull, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category, LatLng, Place } from '@/lib/sim/types';
import { useSimulation } from '@/components/providers/SimulationProvider';
import {
  PhoneScreen,
  usePhone,
  type Phone as PhoneModel
} from '@/hooks/usePhone';
import PhoneMap from '@/components/phone/PhoneMap';
import PickupScreen from '@/components/phone/PickupScreen';
import PickupPinScreen from '@/components/phone/PickupPinScreen';
import OptionsScreen from '@/components/phone/OptionsScreen';
import MatchingScreen from '@/components/phone/MatchingScreen';
import EnRouteScreen from '@/components/phone/EnRouteScreen';
import TripScreen from '@/components/phone/TripScreen';
import DoneScreen from '@/components/phone/DoneScreen';

/** The rider app on the right: every tap here drives the simulation. */
export default function Phone() {
  const { app } = useSimulation();
  const phone: PhoneModel = usePhone();
  const { screen, ride, driver, liveTrip } = phone;

  let sheetContent: ReactNode = null;
  switch (screen) {
    case PhoneScreen.Pickup:
      sheetContent = (
        <PickupScreen
          places={phone.places}
          onChoosePlace={(place: Place) => void phone.choosePlace(place)}
          onShuffle={phone.shufflePlaces}
          onChooseOnMap={phone.openPinMode}
        />
      );
      break;
    case PhoneScreen.PickupPin:
      sheetContent = (
        <PickupPinScreen
          center={phone.pinCenter}
          onConfirm={(place: Place) => void phone.choosePlace(place)}
          onBack={phone.backToPickup}
        />
      );
      break;
    case PhoneScreen.Options:
      sheetContent = (
        <OptionsScreen
          pickup={app.pickup}
          route={app.route}
          quotes={phone.quotes}
          selected={phone.selected}
          loadingRoute={phone.loadingRoute}
          onSelect={(category: Category) => phone.selectCategory(category)}
          onRequest={phone.requestRide}
          onBack={phone.backToPickup}
        />
      );
      break;
    case PhoneScreen.Matching:
      sheetContent = (
        <MatchingScreen
          ride={ride}
          status={phone.status}
          offer={phone.offer}
          offerSecondsLeft={phone.offerSecondsLeft}
          offerLog={phone.offerLog}
          onCancel={phone.cancelRide}
        />
      );
      break;
    case PhoneScreen.EnRoute:
      if (driver && ride) {
        sheetContent = (
          <EnRouteScreen
            driver={driver}
            ride={ride}
            liveTrip={liveTrip}
            onCancel={phone.cancelRide}
          />
        );
      }
      break;
    case PhoneScreen.Trip:
      if (driver) {
        sheetContent = <TripScreen driver={driver} liveTrip={liveTrip} />;
      }
      break;
    case PhoneScreen.Done:
      if (driver && ride) {
        sheetContent = (
          <DoneScreen
            driver={driver}
            ride={ride}
            rating={phone.rating}
            onRate={phone.rateRide}
            onRideAgain={phone.rideAgain}
          />
        );
      }
      break;
  }

  return (
    <div
      id="phone"
      className="phone-inner relative flex h-full flex-col overflow-hidden rounded-fluid-xl bg-surface-primary text-fg-primary"
    >
      <div className="status-bar pointer-events-none absolute inset-x-0 top-0 z-[900] flex justify-between px-7 pt-fixed-s text-fluid-s font-semibold">
        <span className="sb-time">
          {new Date().toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
          })}
        </span>
        <span className="flex items-center gap-1">
          <Signal className="size-3.5" aria-hidden />
          5G
          <BatteryFull className="size-4" aria-hidden />
        </span>
      </div>
      <PhoneMap
        isPinMode={screen === PhoneScreen.PickupPin}
        onPinCenterChange={(center: LatLng) => phone.movePin(center)}
      />
      <div
        className={cn(
          'sheet relative z-[800] -mt-fixed-l min-h-0 flex-1 overflow-auto rounded-t-fluid-s bg-surface-primary px-fixed-l pt-fixed-m pb-fixed-xl text-fluid-s shadow-[0_-6px_18px_rgb(0_0_0/0.12)] before:mx-auto before:-mt-1.5 before:mb-fixed-2xs before:block before:h-1.25 before:w-10 before:rounded-full before:bg-gray-20',
          // No overlap in pin mode: the visible map must equal the Leaflet
          // container so the pin over its center is what gets picked.
          screen === PhoneScreen.PickupPin && 'mt-0 flex-none'
        )}
        data-screen={screen}
      >
        {sheetContent}
      </div>
    </div>
  );
}
