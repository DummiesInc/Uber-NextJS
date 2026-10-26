import type { Driver } from '@/lib/sim/driver';
import type { DriverState } from '@/lib/sim/types';
import { CAT_BADGE } from '@/components/map/icons';

const DRIVER_STATE_LABEL: Record<DriverState, string> = {
  idle: 'Available',
  offered: 'Reviewing an offer',
  toPickup: 'Heading to pickup',
  onTrip: 'On a trip'
};

const ROW_CLASS: string = 'dp-row my-1 text-fg-secondary';

interface DriverPopupProps {
  driver: Driver;
  llmEnabled: boolean;
  onToggleBrain: (driver: Driver) => void;
}

/** Content of a car's Leaflet popup, portalled into the popup container. */
export default function DriverPopup({
  driver,
  llmEnabled,
  onToggleBrain
}: DriverPopupProps) {
  const isLlm: boolean = driver.brain === 'llm';
  const brainLabel: string = isLlm
    ? `✨ Claude — ${driver.persona?.title}`
    : 'Rule-based';
  const toggleLabel: string = !llmEnabled
    ? '✨ Add ANTHROPIC_API_KEY to .env.local for LLM drivers'
    : isLlm
      ? 'Switch to rule-based'
      : '✨ Make Claude-powered';

  return (
    <>
      <div className="dp-head mb-1 flex items-center justify-between text-fluid-m">
        <b>{driver.name}</b>
        <span
          className={`dp-cat rounded-sm px-1.5 text-fluid-xs font-bold ${CAT_BADGE[driver.category]}`}
          data-cat={driver.category}
        >
          {driver.category}
        </span>
      </div>
      <div className={ROW_CLASS}>
        {driver.car} · ⭐ {driver.rating.toFixed(2)}
      </div>
      <div className={ROW_CLASS} data-state={driver.state}>
        Status: {DRIVER_STATE_LABEL[driver.state]}
      </div>
      <div className={ROW_CLASS}>
        Accept chance: <b>{Math.round(driver.acceptChance * 100)}%</b> · trips
        today: {driver.trips}
      </div>
      <div className={ROW_CLASS}>
        Cell <code className="font-mono text-fluid-xs">{driver.cell}</code>
      </div>
      <div className={ROW_CLASS} data-brain={driver.brain}>
        Brain: <b>{brainLabel}</b>
      </div>
      <button
        type="button"
        className="dp-btn mt-fluid-2xs w-full cursor-pointer rounded-md bg-surface-alternate p-1.5 text-fg-alternate disabled:cursor-not-allowed disabled:bg-gray-10 disabled:text-fluid-xs disabled:text-gray-50"
        disabled={!llmEnabled}
        onClick={() => onToggleBrain(driver)}
      >
        {toggleLabel}
      </button>
    </>
  );
}
