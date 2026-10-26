'use client';

import type { ChangeEvent } from 'react';
import { BASEMAPS, type Basemap } from '@/components/map/basemaps';
import { useControls } from '@/components/providers/ControlsProvider';
import {
  CONTROL_CLASS,
  SELECT_CLASS
} from '@/components/modules/controls/controlClasses';

const CHECKBOX_CLASS: string = 'size-3.5 cursor-pointer accent-orange-50';

/** Map layer visibility and the basemap style. */
export default function MapSection() {
  const {
    isGridVisible,
    setIsGridVisible,
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
        Dispatch grid
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
