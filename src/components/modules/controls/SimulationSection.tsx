'use client';

import type { ChangeEvent } from 'react';
import { Pause, Play } from 'lucide-react';
import If from '@/lib/If';
import { useControls } from '@/components/providers/ControlsProvider';
import {
  CONTROL_CLASS,
  ICON_CLASS,
  RANGE_CLASS,
  SELECT_CLASS
} from '@/components/modules/controls/controlClasses';

const SPEED_OPTIONS: number[] = [5, 10, 20, 40];
const MIN_DRIVER_COUNT: number = 5;
const MAX_DRIVER_COUNT: number = 80;
const DRIVER_COUNT_STEP: number = 5;

/** Pause, simulation speed and fleet size. */
export default function SimulationSection() {
  const {
    isPaused,
    setIsPaused,
    speed,
    setSpeed,
    driverCount,
    setDriverCount
  } = useControls();

  return (
    <div className="flex flex-col gap-fixed-2xs">
      <button
        type="button"
        id="pause"
        className={CONTROL_CLASS}
        aria-pressed={isPaused}
        onClick={() => setIsPaused(!isPaused)}
      >
        <If
          condition={isPaused}
          then={<Play className={ICON_CLASS} aria-hidden />}
          else={<Pause className={ICON_CLASS} aria-hidden />}
        />
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      <label className={CONTROL_CLASS}>
        Speed
        <select
          id="speed"
          className={SELECT_CLASS}
          value={speed}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setSpeed(Number(event.target.value))
          }
        >
          {SPEED_OPTIONS.map((speedOption: number) => (
            <option key={speedOption} value={speedOption}>
              {speedOption}×
            </option>
          ))}
        </select>
      </label>
      <label className={CONTROL_CLASS}>
        Drivers
        <input
          id="drivers"
          type="range"
          min={MIN_DRIVER_COUNT}
          max={MAX_DRIVER_COUNT}
          step={DRIVER_COUNT_STEP}
          value={driverCount}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setDriverCount(Number(event.target.value))
          }
          className={RANGE_CLASS}
        />
        <output htmlFor="drivers" className="w-6 text-right tabular-nums">
          {driverCount}
        </output>
      </label>
    </div>
  );
}
