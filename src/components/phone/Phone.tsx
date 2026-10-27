'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { BatteryFull, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MAP_CENTER, OFFER_TIMEOUT_MS } from '@/lib/sim/config';
import { randomPlaces } from '@/lib/sim/data/locations';
import type { Quote } from '@/lib/sim/dispatch';
import type { Driver } from '@/lib/sim/driver';
import type { OfferOutcome, SimEvent } from '@/lib/sim/events';
import type { PathFollower } from '@/lib/sim/geo';
import type { Category, LatLng, Place, Ride } from '@/lib/sim/types';
import {
  useSimEvent,
  useSimulation
} from '@/components/providers/SimulationProvider';
import PhoneMap from '@/components/phone/PhoneMap';
import PickupScreen from '@/components/phone/PickupScreen';
import PickupPinScreen from '@/components/phone/PickupPinScreen';
import OptionsScreen from '@/components/phone/OptionsScreen';
import MatchingScreen from '@/components/phone/MatchingScreen';
import EnRouteScreen from '@/components/phone/EnRouteScreen';
import TripScreen from '@/components/phone/TripScreen';
import DoneScreen from '@/components/phone/DoneScreen';

export enum PhoneScreen {
  Pickup = 'pickup',
  PickupPin = 'pickupPin',
  Options = 'options',
  Matching = 'matching',
  EnRoute = 'enroute',
  Trip = 'trip',
  Done = 'done'
}

export interface PendingOffer {
  driver: Driver;
  startedAt: number;
}

export interface OfferLogEntry {
  id: number;
  driverName: string;
  outcome: OfferOutcome;
  reason: string;
}

/** Remaining pickup / trip leg, recomputed on every phone tick. */
export interface LiveTripProgress {
  minutes: number;
  remainingKm: string;
  remainingS: number;
  percent: number;
}

export interface PhoneState {
  screen: PhoneScreen;
  places: Place[];
  /** Map center under the pin while choosing a pickup on the map. */
  pinCenter: LatLng;
  selected: Category;
  quotes: Quote[];
  loadingRoute: boolean;
  ride: Ride | null;
  driver: Driver | null;
  status: string;
  offer: PendingOffer | null;
  offerLog: OfferLogEntry[];
  rating: number;
}

enum PhoneActionType {
  PlaceChosen = 'placeChosen',
  RouteLoaded = 'routeLoaded',
  QuotesRefreshed = 'quotesRefreshed',
  PlacesShuffled = 'placesShuffled',
  PinModeOpened = 'pinModeOpened',
  PinMoved = 'pinMoved',
  BackToPickup = 'backToPickup',
  CategorySelected = 'categorySelected',
  RideRequestStarted = 'rideRequestStarted',
  RideRequested = 'rideRequested',
  RideCancelled = 'rideCancelled',
  RideRated = 'rideRated',
  RideAgain = 'rideAgain',
  StatusChanged = 'statusChanged',
  OfferSent = 'offerSent',
  OfferResolved = 'offerResolved',
  DriverAssigned = 'driverAssigned',
  DriverArrived = 'driverArrived',
  PickedUp = 'pickedUp',
  DroppedOff = 'droppedOff'
}

type PhoneAction =
  | { type: PhoneActionType.PlaceChosen }
  | { type: PhoneActionType.RouteLoaded; quotes: Quote[] }
  | { type: PhoneActionType.QuotesRefreshed; quotes: Quote[] }
  | { type: PhoneActionType.PlacesShuffled; places: Place[] }
  | { type: PhoneActionType.PinModeOpened }
  | { type: PhoneActionType.PinMoved; center: LatLng }
  | { type: PhoneActionType.BackToPickup }
  | { type: PhoneActionType.CategorySelected; category: Category }
  | { type: PhoneActionType.RideRequestStarted }
  | { type: PhoneActionType.RideRequested; ride: Ride }
  | { type: PhoneActionType.RideCancelled }
  | { type: PhoneActionType.RideRated; stars: number }
  | { type: PhoneActionType.RideAgain; places: Place[] }
  | { type: PhoneActionType.StatusChanged; status: string }
  | { type: PhoneActionType.OfferSent; offer: PendingOffer }
  | { type: PhoneActionType.OfferResolved; entry: OfferLogEntry }
  | { type: PhoneActionType.DriverAssigned; driver: Driver }
  | { type: PhoneActionType.DriverArrived }
  | { type: PhoneActionType.PickedUp }
  | { type: PhoneActionType.DroppedOff };

const QUOTE_REFRESH_MS: number = 2500;
const PHONE_TICK_MS: number = 200;

function createInitialPhoneState(): PhoneState {
  return {
    screen: PhoneScreen.Pickup,
    places: randomPlaces(5),
    pinCenter: MAP_CENTER,
    selected: 'UberX',
    quotes: [],
    loadingRoute: false,
    ride: null,
    driver: null,
    status: '',
    offer: null,
    offerLog: [],
    rating: 0
  };
}

function phoneReducer(state: PhoneState, action: PhoneAction): PhoneState {
  switch (action.type) {
    case PhoneActionType.PlaceChosen:
      return {
        ...state,
        loadingRoute: true,
        quotes: [],
        screen: PhoneScreen.Options
      };
    case PhoneActionType.RouteLoaded: {
      // Keep the chosen category unless it has no cars and another one does.
      const firstAvailable: Quote | undefined = action.quotes.find(
        (quote) => quote.etaMin !== null
      );
      const selectedQuote: Quote | undefined = action.quotes.find(
        (quote) => quote.category === state.selected
      );
      const keepSelected: boolean =
        !firstAvailable || selectedQuote?.etaMin != null;
      return {
        ...state,
        loadingRoute: false,
        quotes: action.quotes,
        selected: keepSelected
          ? state.selected
          : (firstAvailable?.category ?? state.selected)
      };
    }
    case PhoneActionType.QuotesRefreshed:
      return { ...state, quotes: action.quotes };
    case PhoneActionType.PlacesShuffled:
      return { ...state, places: action.places };
    case PhoneActionType.PinModeOpened:
      // PhoneMap opens pin mode at MAP_CENTER, so the label starts there too.
      return { ...state, screen: PhoneScreen.PickupPin, pinCenter: MAP_CENTER };
    case PhoneActionType.PinMoved:
      return { ...state, pinCenter: action.center };
    case PhoneActionType.BackToPickup:
      return { ...state, screen: PhoneScreen.Pickup };
    case PhoneActionType.CategorySelected:
      return { ...state, selected: action.category };
    case PhoneActionType.RideRequestStarted:
      return { ...state, offerLog: [], status: 'Searching ring k=0…' };
    case PhoneActionType.RideRequested:
      return { ...state, ride: action.ride, screen: PhoneScreen.Matching };
    case PhoneActionType.RideCancelled:
      return {
        ...state,
        ride: null,
        driver: null,
        offer: null,
        screen: PhoneScreen.Options
      };
    case PhoneActionType.RideRated:
      return { ...state, rating: action.stars };
    case PhoneActionType.RideAgain:
      return {
        ...state,
        ride: null,
        driver: null,
        rating: 0,
        places: action.places,
        screen: PhoneScreen.Pickup
      };
    case PhoneActionType.StatusChanged:
      return { ...state, status: action.status };
    case PhoneActionType.OfferSent:
      return { ...state, offer: action.offer, status: '' };
    case PhoneActionType.OfferResolved:
      return {
        ...state,
        offer: null,
        offerLog: [action.entry, ...state.offerLog].slice(0, 5),
        status:
          action.entry.outcome === 'accepted'
            ? state.status
            : 'Finding the next closest driver…'
      };
    case PhoneActionType.DriverAssigned:
      return { ...state, driver: action.driver, screen: PhoneScreen.EnRoute };
    case PhoneActionType.DriverArrived:
      // ride.status changed in place; a new state object re-renders it.
      return { ...state };
    case PhoneActionType.PickedUp:
      return { ...state, screen: PhoneScreen.Trip };
    case PhoneActionType.DroppedOff:
      return { ...state, screen: PhoneScreen.Done };
  }
}

/** The rider app on the right: every tap here drives the simulation. */
export default function Phone() {
  const { app, world } = useSimulation();
  const [phoneState, dispatch] = useReducer(
    phoneReducer,
    undefined,
    createInitialPhoneState
  );
  const [nowMs, setNowMs] = useState<number>(() => performance.now());
  const lastQuoteAtRef = useRef<number>(0);
  const nextOfferLogIdRef = useRef<number>(0);
  const { screen, ride, driver, offer } = phoneState;

  useSimEvent((event: SimEvent) => {
    switch (event.type) {
      case 'ring_searched':
        return dispatch({
          type: PhoneActionType.StatusChanged,
          status: `Searching ring k=${event.k} · ${event.cells.length} hex${event.cells.length > 1 ? 'es' : ''}`
        });
      case 'no_drivers':
        return dispatch({
          type: PhoneActionType.StatusChanged,
          status: `No ${event.category} drivers nearby yet. Still looking…`
        });
      case 'offer_sent':
        return dispatch({
          type: PhoneActionType.OfferSent,
          offer: { driver: event.driver, startedAt: event.startedAt }
        });
      case 'offer_result':
        return dispatch({
          type: PhoneActionType.OfferResolved,
          entry: {
            id: nextOfferLogIdRef.current++,
            driverName: event.driver.name,
            outcome: event.outcome,
            reason: event.reason
          }
        });
      case 'driver_assigned':
        return dispatch({
          type: PhoneActionType.DriverAssigned,
          driver: event.driver
        });
      case 'driver_arrived':
        return dispatch({ type: PhoneActionType.DriverArrived });
      case 'picked_up':
        return dispatch({ type: PhoneActionType.PickedUp });
      case 'dropped_off':
        return dispatch({ type: PhoneActionType.DroppedOff });
    }
  });

  // The phone ticks at ~5 Hz: clock, countdowns, ETAs and quote refreshes.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const now: number = performance.now();
      setNowMs(now);
      if (
        screen === PhoneScreen.Options &&
        now - lastQuoteAtRef.current > QUOTE_REFRESH_MS
      ) {
        lastQuoteAtRef.current = now;
        dispatch({
          type: PhoneActionType.QuotesRefreshed,
          quotes: app.quotes()
        });
      }
    }, PHONE_TICK_MS);
    return () => clearInterval(intervalId);
  }, [app, screen]);

  const handleChoosePlace = async (place: Place) => {
    dispatch({ type: PhoneActionType.PlaceChosen });
    await app.selectPickup(place);
    if (app.pickup !== place) return;
    lastQuoteAtRef.current = performance.now();
    dispatch({ type: PhoneActionType.RouteLoaded, quotes: app.quotes() });
  };

  const handleRequestRide = () => {
    dispatch({ type: PhoneActionType.RideRequestStarted });
    const requestedRide: Ride = app.request(phoneState.selected);
    dispatch({ type: PhoneActionType.RideRequested, ride: requestedRide });
  };

  const handleCancelRide = () => {
    app.cancel();
    dispatch({ type: PhoneActionType.RideCancelled });
  };

  const handleBackToPickup = () => {
    app.backToPickup();
    dispatch({ type: PhoneActionType.BackToPickup });
  };

  const handleRideAgain = () => {
    app.reset();
    dispatch({ type: PhoneActionType.RideAgain, places: randomPlaces(5) });
  };

  const offerSecondsLeft: number = offer
    ? Math.max(
        0,
        Math.ceil((OFFER_TIMEOUT_MS - (nowMs - offer.startedAt)) / 1000)
      )
    : 0;

  const driverArrived: boolean = ride?.status === 'driverArrived';
  const activePath: PathFollower | null = driver?.activePath ?? null;
  let liveTrip: LiveTripProgress | null = null;
  if (
    (screen === PhoneScreen.EnRoute || screen === PhoneScreen.Trip) &&
    driver &&
    activePath &&
    !driverArrived
  ) {
    const elapsedS: number = driver.elapsed(world.simTime);
    const remainingS: number = activePath.remainingS(elapsedS);
    liveTrip = {
      minutes: Math.max(1, Math.ceil(remainingS / 60)),
      remainingKm: (activePath.remainingM(elapsedS) / 1000).toFixed(1),
      remainingS,
      percent: Math.min(100, (elapsedS / activePath.durationS) * 100)
    };
  }

  let sheetContent: ReactNode = null;
  switch (screen) {
    case PhoneScreen.Pickup:
      sheetContent = (
        <PickupScreen
          places={phoneState.places}
          onChoosePlace={(place: Place) => void handleChoosePlace(place)}
          onShuffle={() =>
            dispatch({
              type: PhoneActionType.PlacesShuffled,
              places: randomPlaces(5, phoneState.places)
            })
          }
          onChooseOnMap={() =>
            dispatch({ type: PhoneActionType.PinModeOpened })
          }
        />
      );
      break;
    case PhoneScreen.PickupPin:
      sheetContent = (
        <PickupPinScreen
          center={phoneState.pinCenter}
          onConfirm={(place: Place) => void handleChoosePlace(place)}
          onBack={() => dispatch({ type: PhoneActionType.BackToPickup })}
        />
      );
      break;
    case PhoneScreen.Options:
      sheetContent = (
        <OptionsScreen
          pickup={app.pickup}
          route={app.route}
          quotes={phoneState.quotes}
          selected={phoneState.selected}
          loadingRoute={phoneState.loadingRoute}
          onSelect={(category: Category) =>
            dispatch({ type: PhoneActionType.CategorySelected, category })
          }
          onRequest={handleRequestRide}
          onBack={handleBackToPickup}
        />
      );
      break;
    case PhoneScreen.Matching:
      sheetContent = (
        <MatchingScreen
          ride={ride}
          status={phoneState.status}
          offer={offer}
          offerSecondsLeft={offerSecondsLeft}
          offerLog={phoneState.offerLog}
          onCancel={handleCancelRide}
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
            onCancel={handleCancelRide}
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
            rating={phoneState.rating}
            onRate={(stars: number) =>
              dispatch({ type: PhoneActionType.RideRated, stars })
            }
            onRideAgain={handleRideAgain}
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
        onPinCenterChange={(center: LatLng) =>
          dispatch({ type: PhoneActionType.PinMoved, center })
        }
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
