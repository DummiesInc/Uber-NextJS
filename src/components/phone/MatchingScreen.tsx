import { Timer } from 'lucide-react';
import If from '@/lib/If';
import Button from '@/components/atoms/Button';
import type { OfferLogEntry, PhoneState } from '@/components/phone/Phone';
import type { OfferOutcome } from '@/lib/sim/events';

const OUTCOME_ICON: Record<OfferOutcome, string> = {
  accepted: '✅',
  declined: '❌',
  timeout: '⌛'
};

const OUTCOME_VERB: Record<OfferOutcome, string> = {
  accepted: 'accepted',
  declined: 'declined',
  timeout: "didn't respond"
};

interface MatchingScreenProps extends Pick<
  PhoneState,
  'ride' | 'status' | 'offer' | 'offerLog'
> {
  offerSecondsLeft: number;
  onCancel: () => void;
}

/** Ring search in progress: radar, live status / offer countdown, offer log. */
export default function MatchingScreen({
  ride,
  status,
  offer,
  offerSecondsLeft,
  offerLog,
  onCancel
}: MatchingScreenProps) {
  return (
    <>
      <h2 className="mb-fixed-2xs text-fluid-l">
        Finding your {ride?.category ?? ''}
      </h2>
      {/* 120px radar per the original; no token that large, arbitrary by design */}
      <div className="radar relative mx-auto mt-fixed-2xs mb-fixed-s grid size-[120px] place-items-center">
        <span className="absolute inset-0 animate-radar rounded-full border-2 border-stroke-primary opacity-0" />
        <span className="absolute inset-0 animate-radar rounded-full border-2 border-stroke-primary opacity-0 [animation-delay:0.8s]" />
        <span className="absolute inset-0 animate-radar rounded-full border-2 border-stroke-primary opacity-0 [animation-delay:1.6s]" />
        <b className="text-fluid-2xl">🧍</b>
      </div>
      <div className="live-status min-h-fixed-2xl text-center text-fluid-m">
        <If
          condition={offer}
          then={
            <>
              Offering to <b>{offer?.driver.name}</b> ({offer?.driver.category}){' '}
              <span className="countdown ml-1.5 inline-flex items-center gap-1 rounded-full bg-yellow-10 px-fluid-2xs py-px font-bold text-yellow-80 tabular-nums">
                <Timer className="size-3.5" aria-hidden />
                {offerSecondsLeft}s
              </span>
            </>
          }
          else={status}
        />
      </div>
      <ul className="offer-log mt-fixed-s">
        {offerLog.map((entry: OfferLogEntry) => (
          <li
            key={entry.id}
            data-outcome={entry.outcome}
            className="mb-1.5 animate-enter rounded-md bg-surface-secondary px-fixed-2xs py-1.75 text-fluid-s leading-snug"
          >
            {OUTCOME_ICON[entry.outcome]} {entry.driverName}{' '}
            {OUTCOME_VERB[entry.outcome]}
            <If condition={entry.outcome !== 'timeout'}>
              {` · “${entry.reason}”`}
            </If>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onCancel}>
        Cancel request
      </Button>
    </>
  );
}
