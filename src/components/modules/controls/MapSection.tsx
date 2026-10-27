'use client';

import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { HEAT_LEVELS, type HeatLevel } from '@/lib/sim/heat';
import { BASEMAPS, type Basemap } from '@/components/map/basemaps';
import { AUTO_LEVEL_MODE, type LevelMode } from '@/components/map/mapView';
import { useControls } from '@/components/providers/ControlsProvider';
import {
  CONTROL_CLASS,
  SELECT_CLASS
} from '@/components/modules/controls/controlClasses';

const CHECKBOX_CLASS: string = 'size-3.5 cursor-pointer accent-orange-50';

interface LevelModeOption {
  mode: LevelMode;
  label: string;
}

const LEVEL_MODE_OPTIONS: LevelModeOption[] = [
  { mode: AUTO_LEVEL_MODE, label: 'Auto' },
  { mode: 7, label: 'Res 7 · city' },
  { mode: 8, label: 'Res 8 · dispatch' },
  { mode: 9, label: 'Res 9 · street' }
];

/** Map layer visibility, the H3 grid level and the basemap style. */
export default function MapSection() {
  const {
    isGridVisible,
    setIsGridVisible,
    isParentOutlinesVisible,
    setIsParentOutlinesVisible,
    levelMode,
    setLevelMode,
    currentLevel,
    isHeatVisible,
    setIsHeatVisible,
    basemap,
    setBasemap
  } = useControls();

  const handleBasemapChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextBasemap: Basemap | undefined = BASEMAPS.find(
      (option: Basemap) => option.name === event.target.value
    );
    if (nextBasemap) setBasemap(nextBasemap);
  };

  const handleLevelModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const level: HeatLevel | undefined = HEAT_LEVELS.find(
      (res: HeatLevel) => String(res) === event.target.value
    );
    setLevelMode(level ?? AUTO_LEVEL_MODE);
  };

  return (
    <div className="flex flex-col gap-fixed-2xs">
      <label className={CONTROL_CLASS}>
        <input
          type="checkbox"
          role="switch"
          className={CHECKBOX_CLASS}
          checked={isGridVisible}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setIsGridVisible(event.target.checked)
          }
        />
        Cell outlines
      </label>
      <label className={CONTROL_CLASS}>
        <input
          type="checkbox"
          role="switch"
          className={CHECKBOX_CLASS}
          checked={isParentOutlinesVisible}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setIsParentOutlinesVisible(event.target.checked)
          }
        />
        Parent outlines
      </label>
      <label className={cn(CONTROL_CLASS, 'whitespace-nowrap')}>
        Grid level
        {/* The drawer row is too narrow for a separate level tag beside the
            select, so Auto shows the level on screen in its own label. */}
        <select
          id="grid-level"
          className={cn(SELECT_CLASS, 'level-current min-w-0 tabular-nums')}
          value={String(levelMode)}
          onChange={handleLevelModeChange}
        >
          {LEVEL_MODE_OPTIONS.map(({ mode, label }: LevelModeOption) => (
            <option key={mode} value={String(mode)}>
              {mode === AUTO_LEVEL_MODE
                ? `${label} · res ${currentLevel}`
                : label}
            </option>
          ))}
        </select>
      </label>
      <label className={CONTROL_CLASS}>
        <input
          type="checkbox"
          role="switch"
          className={CHECKBOX_CLASS}
          checked={isHeatVisible}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setIsHeatVisible(event.target.checked)
          }
        />
        Demand heat
      </label>
      <label className={CONTROL_CLASS}>
        Basemap
        <select
          id="basemap"
          className={SELECT_CLASS}
          value={basemap.name}
          onChange={handleBasemapChange}
        >
          {BASEMAPS.map((option: Basemap) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
