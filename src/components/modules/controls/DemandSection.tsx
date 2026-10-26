'use client';

import type { ChangeEvent } from 'react';
import {
  Eraser,
  Paintbrush,
  Shuffle,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import If from '@/lib/If';
import { HeatTool, type HeatBrush } from '@/components/map/mapView';
import { useSimulation } from '@/components/providers/SimulationProvider';
import { useControls } from '@/components/providers/ControlsProvider';
import {
  CONTROL_CLASS,
  ICON_CLASS,
  RANGE_CLASS
} from '@/components/modules/controls/controlClasses';

interface HeatToolOption {
  tool: HeatTool;
  label: string;
  icon: LucideIcon;
}

const HEAT_TOOL_OPTIONS: HeatToolOption[] = [
  { tool: HeatTool.Paint, label: 'Paint', icon: Paintbrush },
  { tool: HeatTool.Erase, label: 'Erase', icon: Eraser }
];
const BRUSH_RING_OPTIONS: number[] = [1, 2, 3];

/** Control-height chip; `aria-pressed` marks the active tool / brush size. */
const CHIP_CLASS: string = cn(
  CONTROL_CLASS,
  'justify-center gap-1.5 hover:bg-gray-70 aria-pressed:border-stroke-accent aria-pressed:bg-surface-accent aria-pressed:font-semibold aria-pressed:text-fg-alternate aria-pressed:hover:bg-surface-accent'
);

/** Demand heat map editing: reset, randomize, and the paint/erase brush. */
export default function DemandSection() {
  const { world } = useSimulation();
  const { heatBrush, setHeatBrush } = useControls();

  const handleToggleHeatTool = (tool: HeatTool) =>
    setHeatBrush((brush: HeatBrush) => ({
      ...brush,
      tool: brush.tool === tool ? HeatTool.None : tool
    }));

  return (
    <div className="flex flex-col gap-fixed-2xs">
      <div className="grid grid-cols-2 gap-fixed-2xs">
        <button
          type="button"
          onClick={() => world.heat.randomize()}
          className={CHIP_CLASS}
        >
          <Shuffle className={ICON_CLASS} aria-hidden />
          Randomize
        </button>
        <button
          type="button"
          onClick={() => world.heat.clear()}
          className={CHIP_CLASS}
        >
          <Trash2 className={ICON_CLASS} aria-hidden />
          Clear
        </button>
        {HEAT_TOOL_OPTIONS.map(({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={heatBrush.tool === tool}
            onClick={() => handleToggleHeatTool(tool)}
            className={CHIP_CLASS}
          >
            <Icon className={ICON_CLASS} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <If condition={heatBrush.tool !== HeatTool.None}>
        <div className="flex flex-col gap-fixed-2xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-30">Brush size</span>
            <div className="flex gap-1.5">
              {BRUSH_RING_OPTIONS.map((rings: number) => (
                <button
                  key={rings}
                  type="button"
                  aria-pressed={heatBrush.rings === rings}
                  aria-label={`Brush size ${rings}`}
                  onClick={() =>
                    setHeatBrush((brush: HeatBrush) => ({ ...brush, rings }))
                  }
                  className={cn(CHIP_CLASS, 'w-fixed-5xl px-0 tabular-nums')}
                >
                  {rings}
                </button>
              ))}
            </div>
          </div>
          <label className={CONTROL_CLASS}>
            Strength
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.05}
              value={heatBrush.strength}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setHeatBrush((brush: HeatBrush) => ({
                  ...brush,
                  strength: Number(event.target.value)
                }))
              }
              className={RANGE_CLASS}
            />
            <output className="w-8 text-right tabular-nums">
              {Math.round(heatBrush.strength * 100)}%
            </output>
          </label>
        </div>
      </If>
    </div>
  );
}
