import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import If from '@/lib/If';
import { CATEGORIES, DESTINATION } from '@/lib/sim/config';
import type { Quote } from '@/lib/sim/dispatch';
import type { Category, Place, Route } from '@/lib/sim/types';
import type { PhoneState } from '@/components/phone/Phone';
import Button from '@/components/atoms/Button';

const RIDE_EMOJI: Record<Category, string> = {
  UberX: '🚗',
  Priority: '⚡',
  Comfort: '🚙',
  UberXL: '🚐'
};

interface OptionsScreenProps extends Pick<
  PhoneState,
  'quotes' | 'selected' | 'loadingRoute'
> {
  pickup: Place | null;
  route: Route | null;
  onSelect: (category: Category) => void;
  onRequest: () => void;
  onBack: () => void;
}

/** Ride options with live prices and pickup ETAs for the chosen pickup. */
export default function OptionsScreen({
  pickup,
  route,
  quotes,
  selected,
  loadingRoute,
  onSelect,
  onRequest,
  onBack
}: OptionsScreenProps) {
  const tripSummary: string = route
    ? `${(route.distanceM / 1000).toFixed(1)} km · ${Math.round(route.durationS / 60)} min trip${route.source === 'hex' ? ' · (approx. route)' : ''}`
    : 'Finding the best route…';
  const selectedQuote: Quote | undefined = quotes.find(
    (quote) => quote.category === selected
  );
  const canRequest: boolean =
    !loadingRoute && Boolean(selectedQuote) && selectedQuote?.etaMin !== null;

  return (
    <>
      <div className="sheet-top flex items-center gap-fluid-2xs">
        <button
          type="button"
          className="icon-btn grid size-fixed-6xl cursor-pointer place-items-center rounded-full bg-surface-secondary hover:bg-surface-tertiary"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft className="size-4.5" aria-hidden />
        </button>
        <h2 className="text-fluid-l">Choose a ride</h2>
      </div>
      <div className="trip-line my-fixed-2xs">
        <b>{pickup?.name}</b>
        <If condition={pickup && pickup.area !== pickup.name}>
          <span className="text-fg-secondary"> · {pickup?.area}</span>
        </If>{' '}
        → <b>{DESTINATION.name}</b>
        <small className="block text-fluid-xs text-fg-secondary">
          {tripSummary}
        </small>
      </div>
      <ul className="ride-options">
        <If
          condition={loadingRoute}
          then={
            <li className="loading p-fixed-xl text-center text-fluid-s text-fg-secondary">
              Calculating prices…
            </li>
          }
          else={quotes.map((quote: Quote) => (
            <li key={quote.category} className="text-fluid-s leading-snug">
              <button
                type="button"
                data-cat={quote.category}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-fixed-xs rounded-fluid-xs border-2 border-transparent p-fixed-2xs text-left text-fg-primary disabled:cursor-not-allowed disabled:opacity-40',
                  quote.category === selected &&
                    'sel border-stroke-primary bg-surface-secondary'
                )}
                disabled={quote.etaMin === null}
                onClick={() => onSelect(quote.category)}
              >
                <span className="ride-emoji w-fixed-8xl text-center text-fluid-xl">
                  {RIDE_EMOJI[quote.category]}
                </span>
                <span className="ro-text flex-1">
                  <b>
                    {quote.category}{' '}
                    <span className="seats ml-1 text-fluid-xs font-normal text-fg-secondary">
                      👤{CATEGORIES[quote.category].seats}
                    </span>
                  </b>
                  <If
                    condition={quote.etaMin === null}
                    then={
                      <small className="none block text-fluid-xs text-fg-error">
                        No cars nearby
                      </small>
                    }
                    else={
                      <small className="block text-fluid-xs text-fg-secondary">
                        {quote.etaMin} min away · arrive{' '}
                        {new Date(
                          Date.now() +
                            ((quote.etaMin ?? 0) * 60 +
                              (route?.durationS ?? 0)) *
                              1000
                        ).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </small>
                    }
                  />
                  <small className="blurb block text-fluid-xs text-gray-40">
                    {CATEGORIES[quote.category].blurb}
                  </small>
                </span>
                <span className="price text-fluid-m font-bold">
                  ${quote.fare.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        />
      </ul>
      {/* Sticks flush with the sheet's bottom padding. */}
      <div className="confirm sticky -bottom-fixed-xl bg-surface-primary pt-fixed-2xs pb-1">
        <Button disabled={!canRequest} onClick={onRequest}>
          Choose {selected}
          <If condition={selectedQuote}>
            {` · $${selectedQuote?.fare.toFixed(2)}`}
          </If>
        </Button>
      </div>
    </>
  );
}
