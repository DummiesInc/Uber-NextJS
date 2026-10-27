'use client';

import { useRef, useState, type ReactNode } from 'react';
import { placeLabel } from '@/lib/utils';
import { MAX_K } from '@/lib/sim/config';
import type { SimEvent } from '@/lib/sim/events';
import type { Route } from '@/lib/sim/types';
import { useSimEvent } from '@/components/providers/SimulationProvider';

enum FeedTone {
  Info = 'info',
  Search = 'search',
  Offer = 'offer',
  Good = 'good',
  Bad = 'bad',
  Warn = 'warn'
}

// Light steps of each tone so they read on the dark feed panel.
const FEED_TONE_CLASS: Record<FeedTone, string> = {
  [FeedTone.Info]: 'text-gray-10',
  [FeedTone.Search]: 'text-orange-20',
  [FeedTone.Offer]: 'text-yellow-20',
  [FeedTone.Good]: 'text-fg-success',
  [FeedTone.Bad]: 'text-orange-40',
  [FeedTone.Warn]: 'text-fg-warning'
};

interface FeedMessage {
  tone: FeedTone;
  message: ReactNode;
}

interface FeedEntry extends FeedMessage {
  id: number;
  time: string;
}

const MAX_FEED_ENTRIES: number = 120;

const ROUTE_SOURCE_LABEL: Record<Route['source'], string> = {
  osrm: 'OSRM roads',
  roads: 'local road graph',
  hex: 'H3 path fallback'
};

const shortCell = (cell: string) => `${cell.slice(0, 6)}…${cell.slice(-3)}`;
const km = (meters: number) => `${(meters / 1000).toFixed(1)} km`;
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

/** Feed line for a bus event, or null for events the feed ignores. */
function describeFeedEvent(event: SimEvent): FeedMessage | null {
  switch (event.type) {
    case 'pickup_selected':
      return {
        tone: FeedTone.Info,
        message: (
          <>
            📍 Rider placed at <b>{placeLabel(event.place)}</b> → H3 cell{' '}
            <code>{shortCell(event.cell)}</code>
          </>
        )
      };
    case 'trip_previewed':
      return {
        tone: FeedTone.Info,
        message: `🗺️ Route to Lakeside Hills: ${km(event.route.distanceM)}, ${minutes(event.route.durationS)}, crosses ${event.cells.length} hexes (${ROUTE_SOURCE_LABEL[event.route.source]})`
      };
    case 'ride_requested':
      return {
        tone: FeedTone.Info,
        message: (
          <>
            🙋 Ride #{event.ride.id} requested: <b>{event.ride.category}</b>{' '}
            from cell <code>{shortCell(event.ride.pickupCell)}</code>
          </>
        )
      };
    case 'ring_searched':
      return {
        tone: FeedTone.Search,
        message: (
          <>
            🔎 Ring k={event.k}: {event.cells.length} cell
            {event.cells.length > 1 ? 's' : ''} checked · <b>{event.found}</b>{' '}
            free {event.ride.category}
          </>
        )
      };
    case 'offer_sent':
      return {
        tone: FeedTone.Offer,
        message: (
          <>
            📨 Offer → <b>{event.driver.name}</b> ({event.driver.category}
            {event.driver.brain === 'llm' ? ' ✨' : ''}, ring {event.k},{' '}
            {Math.round(event.driver.acceptChance * 100)}% accept rate) · ⏱ 15s
          </>
        )
      };
    case 'offer_result': {
      const after: string = `${(event.afterMs / 1000).toFixed(1)}s`;
      if (event.outcome === 'accepted') {
        return {
          tone: FeedTone.Good,
          message: (
            <>
              ✅ <b>{event.driver.name}</b> accepted after {after}: “
              {event.reason}”
            </>
          )
        };
      }
      if (event.outcome === 'declined') {
        return {
          tone: FeedTone.Bad,
          message: (
            <>
              ❌ <b>{event.driver.name}</b> declined after {after}: “
              {event.reason}” → next driver
            </>
          )
        };
      }
      return {
        tone: FeedTone.Warn,
        message: (
          <>
            ⌛ <b>{event.driver.name}</b> didn&apos;t answer in 15s → next
            driver
          </>
        )
      };
    }
    case 'no_drivers':
      return {
        tone: FeedTone.Warn,
        message: `😕 No free ${event.category} within ${MAX_K} rings. Retrying shortly…`
      };
    case 'driver_assigned':
      return {
        tone: FeedTone.Good,
        message: `🚗 ${event.driver.name} heading to pickup: ${km(event.route.distanceM)}, ${minutes(event.route.durationS)}`
      };
    case 'driver_arrived':
      return {
        tone: FeedTone.Good,
        message: `📍 ${event.driver.name} arrived at ${placeLabel(event.ride.pickup)}`
      };
    case 'picked_up':
      return {
        tone: FeedTone.Good,
        message: '🧍➡️🚗 Rider picked up. Driving to Lakeside Hills Plaza'
      };
    case 'dropped_off':
      return {
        tone: FeedTone.Good,
        message: `🏁 Dropped off at 17041 Lakeside Hills Plaza. Fare $${event.ride.fare.toFixed(2)}`
      };
    case 'ride_cancelled':
      return {
        tone: FeedTone.Warn,
        message: `🚫 Ride #${event.ride.id} cancelled by rider`
      };
    default:
      return null;
  }
}

/** Newest-first log of everything the dispatcher does. */
export default function DispatchFeed() {
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const nextEntryIdRef = useRef<number>(0);

  useSimEvent((event: SimEvent) => {
    const described: FeedMessage | null = describeFeedEvent(event);
    if (!described) return;
    const entry: FeedEntry = {
      ...described,
      id: nextEntryIdRef.current++,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    setFeedEntries((entries) => [entry, ...entries].slice(0, MAX_FEED_ENTRIES));
  });

  return (
    <div
      id="feed"
      className="feed min-h-0 overflow-auto border-t border-stroke-secondary bg-gray-90 px-fixed-m pb-fluid-2xs"
    >
      <h3 className="sticky top-0 bg-gray-90 pt-fixed-2xs pb-1 font-inter text-fluid-xs font-semibold tracking-widest text-gray-30 uppercase">
        Dispatch feed
      </h3>
      <ol className="mt-0">
        {feedEntries.map((entry: FeedEntry) => (
          <li
            key={entry.id}
            className={`tone-${entry.tone} flex animate-enter gap-fixed-2xs border-b border-dashed border-stroke-secondary py-1 text-fluid-s leading-snug ${FEED_TONE_CLASS[entry.tone]}`}
            data-tone={entry.tone}
          >
            <time className="flex-none text-gray-40 tabular-nums">
              {entry.time}
            </time>
            <span>{entry.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
