import If from '@/lib/If';
import type { Driver } from '@/lib/sim/driver';
import { CAT_BADGE } from '@/components/map/icons';

const PLATE_LETTERS: string = 'ABCDEFGHJKLMNPRSTUVWXYZ';

/** Deterministic fake licence plate per driver id. */
function plateForDriverId(id: number): string {
  const letter = (n: number) =>
    PLATE_LETTERS[(id * 7 + n * 13) % PLATE_LETTERS.length];
  return `${letter(1)}${letter(2)}${letter(3)} ${String(100 + ((id * 271) % 900))}`;
}

interface DriverCardProps {
  driver: Driver;
}

/** Assigned driver summary shown on the en route, trip and done screens. */
export default function DriverCard({ driver }: DriverCardProps) {
  return (
    <div className="driver-card flex items-center gap-fixed-xs rounded-fluid-xs bg-surface-secondary p-fixed-xs text-fluid-s leading-snug">
      <div
        className={`avatar grid size-fixed-9xl flex-none place-items-center rounded-full text-fluid-l font-bold ${CAT_BADGE[driver.category]}`}
        data-cat={driver.category}
      >
        {driver.name[0]}
      </div>
      <div className="dc-text flex-1">
        <b>
          {driver.name}
          <If condition={driver.brain === 'llm'}> ✨</If>
        </b>
        <small className="block text-fluid-xs text-fg-secondary">
          ⭐ {driver.rating.toFixed(2)} · {driver.category}
        </small>
        <small className="block text-fluid-xs text-fg-secondary">
          {driver.car}
        </small>
      </div>
      <div className="plate rounded-sm border border-gray-20 bg-surface-primary px-fluid-2xs py-1 font-mono font-bold">
        {plateForDriverId(driver.id)}
      </div>
    </div>
  );
}
