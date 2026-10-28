'use client';

import { useEffect, useRef, useState } from 'react';
import { MAP_CENTER, OFFER_TIMEOUT_MS } from '@/lib/sim/config';
import { randomPlaces } from '@/lib/sim/data/locations';
import type { Quote } from '@/lib/sim/dispatch';
import { driverElapsed, type Driver } from '@/lib/sim/driver';
import type { OfferOutcome, SimEvent } from '@/lib/sim/events';
import { pathRemainingM, pathRemainingS, type Path } from '@/lib/sim/geo';
import type { Category, LatLng, Place, Ride } from '@/lib/sim/types';
import {
  useSimEvent,
  useSimulation
} from '@/components/providers/SimulationProvider';

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

/** What the phone screens read, plus the taps they can make. */
export interface Phone extends PhoneState {
  offerSecondsLeft: number;
  liveTrip: LiveTripProgress | null;
  choosePlace: (place: Place) => Promise<void>;
  shufflePlaces: () => void;
  openPinMode: () => void;
  movePin: (center: LatLng) => void;
  backToPickup: () => void;
  selectCategory: (category: Category) => void;
  requestRide: () => void;
  cancelRide: () => void;
  rateRide: (stars: number) => void;
  rideAgain: () => void;
}

const QUOTE_REFRESH_MS: number = 2500;
const PHONE_TICK_MS: number = 200;
const OFFER_LOG_SIZE: number = 5;

/**
 * The rider app's state and actions. Screens call these functions directly;
 * simulation events (offers, assignment, pickup, drop-off) update the same
 * state from the engine's bus.
 */
export function usePhone(): Phone {
  const { app, world } = useSimulation();
  const [screen, setScreen] = useState<PhoneScreen>(PhoneScreen.Pickup);
  const [places, setPlaces] = useState<Place[]>(() => randomPlaces(5));
  const [pinCenter, setPinCenter] = useState<LatLng>(MAP_CENTER);
  const [selected, setSelected] = useState<Category>('UberX');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [status, setStatus] = useState<string>('');
  const [offer, setOffer] = useState<PendingOffer | null>(null);
  const [offerLog, setOfferLog] = useState<OfferLogEntry[]>([]);
  const [rating, setRating] = useState<number>(0);
  // The engine changes ride.status in place, so bump this to re-render.
  const [, setRideVersion] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => performance.now());
  const lastQuoteAtRef = useRef<number>(0);
  const nextOfferLogIdRef = useRef<number>(0);

  useSimEvent((event: SimEvent) => {
    switch (event.type) {
      case 'ring_searched':
        setStatus(
          `Searching ring k=${event.k} · ${event.cells.length} hex${event.cells.length > 1 ? 'es' : ''}`
        );
        return;
      case 'no_drivers':
        setStatus(`No ${event.category} drivers nearby yet. Still looking…`);
        return;
      case 'offer_sent':
        setOffer({ driver: event.driver, startedAt: event.startedAt });
        setStatus('');
        return;
      case 'offer_result':
        setOffer(null);
        setOfferLog((log: OfferLogEntry[]) =>
          [
            {
              id: nextOfferLogIdRef.current++,
              driverName: event.driver.name,
              outcome: event.outcome,
              reason: event.reason
            },
            ...log
          ].slice(0, OFFER_LOG_SIZE)
        );
        if (event.outcome !== 'accepted') {
          setStatus('Finding the next closest driver…');
        }
        return;
      case 'driver_assigned':
        setDriver(event.driver);
        setScreen(PhoneScreen.EnRoute);
        return;
      case 'driver_arrived':
        setRideVersion((version: number) => version + 1);
        return;
      case 'picked_up':
        setScreen(PhoneScreen.Trip);
        return;
      case 'dropped_off':
        setScreen(PhoneScreen.Done);
        return;
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
        setQuotes(app.quotes());
      }
    }, PHONE_TICK_MS);
    return () => clearInterval(intervalId);
  }, [app, screen]);

  const choosePlace = async (place: Place) => {
    setLoadingRoute(true);
    setQuotes([]);
    setScreen(PhoneScreen.Options);
    await app.selectPickup(place);
    if (app.pickup !== place) return;
    lastQuoteAtRef.current = performance.now();
    const routeQuotes: Quote[] = app.quotes();
    setLoadingRoute(false);
    setQuotes(routeQuotes);
    // Keep the chosen category unless it has no cars and another one does.
    setSelected((current: Category) => {
      const firstAvailable: Quote | undefined = routeQuotes.find(
        (quote: Quote) => quote.etaMin !== null
      );
      const currentQuote: Quote | undefined = routeQuotes.find(
        (quote: Quote) => quote.category === current
      );
      if (!firstAvailable || currentQuote?.etaMin != null) return current;
      return firstAvailable.category;
    });
  };

  const openPinMode = () => {
    // PhoneMap opens pin mode at MAP_CENTER, so the label starts there too.
    setPinCenter(MAP_CENTER);
    setScreen(PhoneScreen.PickupPin);
  };

  const backToPickup = () => {
    if (screen === PhoneScreen.Options) app.backToPickup();
    setScreen(PhoneScreen.Pickup);
  };

  const requestRide = () => {
    setOfferLog([]);
    setStatus('Searching ring k=0…');
    setRide(app.request(selected));
    setScreen(PhoneScreen.Matching);
  };

  const cancelRide = () => {
    app.cancel();
    setRide(null);
    setDriver(null);
    setOffer(null);
    setScreen(PhoneScreen.Options);
  };

  const rideAgain = () => {
    app.reset();
    setRide(null);
    setDriver(null);
    setRating(0);
    setPlaces(randomPlaces(5));
    setScreen(PhoneScreen.Pickup);
  };

  const offerSecondsLeft: number = offer
    ? Math.max(
        0,
        Math.ceil((OFFER_TIMEOUT_MS - (nowMs - offer.startedAt)) / 1000)
      )
    : 0;

  const activePath: Path | null = driver?.path ?? null;
  let liveTrip: LiveTripProgress | null = null;
  if (
    (screen === PhoneScreen.EnRoute || screen === PhoneScreen.Trip) &&
    driver &&
    activePath &&
    ride?.status !== 'driverArrived'
  ) {
    const elapsedS: number = driverElapsed(driver, world.simTime);
    const remainingS: number = pathRemainingS(activePath, elapsedS);
    liveTrip = {
      minutes: Math.max(1, Math.ceil(remainingS / 60)),
      remainingKm: (pathRemainingM(activePath, elapsedS) / 1000).toFixed(1),
      remainingS,
      percent: Math.min(100, (elapsedS / activePath.durationS) * 100)
    };
  }

  return {
    screen,
    places,
    pinCenter,
    selected,
    quotes,
    loadingRoute,
    ride,
    driver,
    status,
    offer,
    offerLog,
    rating,
    offerSecondsLeft,
    liveTrip,
    choosePlace,
    shufflePlaces: () => setPlaces(randomPlaces(5, places)),
    openPinMode,
    movePin: setPinCenter,
    backToPickup,
    selectCategory: setSelected,
    requestRide,
    cancelRide,
    rateRide: setRating,
    rideAgain
  };
}
