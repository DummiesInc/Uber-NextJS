'use client';

import { useState, type ChangeEvent } from 'react';
import { Pause, Play } from 'lucide-react';
import If from '@/lib/If';
import { DEFAULT_DRIVER_COUNT, DEFAULT_SIM_SPEED } from '@/lib/sim/config';
import { useSimulation } from '@/components/providers/SimulationProvider';

const CONTROL_CLASS: string =
  'ctl inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-70 bg-gray-80 px-fixed-2xs py-1 text-fluid-s text-gray-10';
const SELECT_CLASS: string =
  'cursor-pointer bg-transparent text-gray-10 [&>option]:text-fg-primary';

const SPEED_OPTIONS: number[] = [5, 10, 20, 40];
const DRIVER_COUNT_OPTIONS: number[] = [15, 30, 45, 60];

/** Brand plus the simulation controls: pause, speed and fleet size. */
export default function TopBar() {
  const { world } = useSimulation();
  const [isPaused, setIsPaused] = useState<boolean>(world.paused);
  const [simSpeed, setSimSpeed] = useState<number>(DEFAULT_SIM_SPEED);
  const [driverCount, setDriverCount] = useState<number>(DEFAULT_DRIVER_COUNT);

  const handleTogglePause = () => {
    world.paused = !world.paused;
    setIsPaused(world.paused);
  };

  const handleSpeedChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const speed: number = Number(event.target.value);
    world.speed = speed;
    setSimSpeed(speed);
  };

  const handleDriverCountChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const count: number = Number(event.target.value);
    world.setDriverCount(count);
    setDriverCount(count);
  };

  return (
    <header className="topbar flex items-center justify-between gap-fixed-xs border-b border-stroke-secondary bg-gray-90 px-fixed-m py-fixed-2xs">
      <div className="brand flex min-w-0 items-baseline gap-fixed-2xs">
        <h1 className="text-fluid-l whitespace-nowrap text-fg-alternate">
          Take me to work
        </h1>
        <span className="truncate text-fluid-s text-gray-30">
          Omaha · H3 res 8 dispatch simulator
        </span>
      </div>
      <div className="controls flex shrink-0 flex-wrap justify-end gap-fluid-2xs">
        <button
          type="button"
          id="pause"
          className={CONTROL_CLASS}
          aria-pressed={isPaused}
          onClick={handleTogglePause}
        >
          <If
            condition={isPaused}
            then={<Play className="size-3.5" aria-hidden />}
            else={<Pause className="size-3.5" aria-hidden />}
          />
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <label className={CONTROL_CLASS}>
          Speed
          <select
            id="speed"
            className={SELECT_CLASS}
            value={simSpeed}
            onChange={handleSpeedChange}
          >
            {SPEED_OPTIONS.map((speed: number) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <label className={CONTROL_CLASS}>
          Drivers
          <select
            id="drivers"
            className={SELECT_CLASS}
            value={driverCount}
            onChange={handleDriverCountChange}
          >
            {DRIVER_COUNT_OPTIONS.map((count: number) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
