'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { DEFAULT_DRIVER_COUNT, DEFAULT_SIM_SPEED } from '@/lib/sim/config';
import { HEAT_LEVELS, type HeatLevel } from '@/lib/sim/heat';
import { savedBasemap, type Basemap } from '@/components/map/basemaps';
import {
  AUTO_LEVEL_MODE,
  HeatTool,
  type HeatBrush,
  type LevelMode
} from '@/components/map/mapView';
import { useSimulation } from '@/components/providers/SimulationProvider';

const PANEL_OPEN_STORAGE_KEY: string = 'mini-uber.panel-open.v1';

/** Defaults to open on a first visit or when storage is blocked. */
function loadSavedIsPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const LEVEL_MODE_STORAGE_KEY: string = 'mini-uber.level-mode.v1';

/** Defaults to Auto on a first visit, a bad value, or blocked storage. */
function loadSavedLevelMode(): LevelMode {
  try {
    const saved: string | null = localStorage.getItem(LEVEL_MODE_STORAGE_KEY);
    const level: HeatLevel | undefined = HEAT_LEVELS.find(
      (res: HeatLevel) => String(res) === saved
    );
    return level ?? AUTO_LEVEL_MODE;
  } catch {
    return AUTO_LEVEL_MODE;
  }
}

interface ControlsContextValue {
  isPanelOpen: boolean;
  setIsPanelOpen: (isOpen: boolean) => void;
  isPaused: boolean;
  setIsPaused: (isPaused: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  driverCount: number;
  setDriverCount: (count: number) => void;
  /** Outlines of the cells at the level on screen. */
  isGridVisible: boolean;
  setIsGridVisible: Dispatch<SetStateAction<boolean>>;
  isParentOutlinesVisible: boolean;
  setIsParentOutlinesVisible: Dispatch<SetStateAction<boolean>>;
  levelMode: LevelMode;
  setLevelMode: (mode: LevelMode) => void;
  /** The H3 level the map is showing, reported by MapView; not persisted. */
  currentLevel: HeatLevel;
  setCurrentLevel: Dispatch<SetStateAction<HeatLevel>>;
  isHeatVisible: boolean;
  setIsHeatVisible: Dispatch<SetStateAction<boolean>>;
  basemap: Basemap;
  setBasemap: Dispatch<SetStateAction<Basemap>>;
  heatBrush: HeatBrush;
  setHeatBrush: Dispatch<SetStateAction<HeatBrush>>;
}

interface ControlsProviderProps {
  children: ReactNode;
}

const ControlsContext = createContext<ControlsContextValue | null>(null);

/**
 * Every user-facing setting. Simulation settings write through to `world`;
 * GodMap applies the map settings to its MapView.
 */
export default function ControlsProvider({ children }: ControlsProviderProps) {
  const { world } = useSimulation();
  const [isPanelOpen, setIsPanelOpenState] =
    useState<boolean>(loadSavedIsPanelOpen);
  const [isPaused, setIsPausedState] = useState<boolean>(world.paused);
  const [speed, setSpeedState] = useState<number>(DEFAULT_SIM_SPEED);
  const [driverCount, setDriverCountState] =
    useState<number>(DEFAULT_DRIVER_COUNT);
  const [isGridVisible, setIsGridVisible] = useState<boolean>(true);
  const [isParentOutlinesVisible, setIsParentOutlinesVisible] =
    useState<boolean>(true);
  const [levelMode, setLevelModeState] =
    useState<LevelMode>(loadSavedLevelMode);
  // MapView reports the real level as soon as it mounts.
  const [currentLevel, setCurrentLevel] = useState<HeatLevel>(8);
  const [isHeatVisible, setIsHeatVisible] = useState<boolean>(true);
  const [basemap, setBasemap] = useState<Basemap>(savedBasemap);
  const [heatBrush, setHeatBrush] = useState<HeatBrush>({
    tool: HeatTool.None,
    rings: 1,
    strength: 0.2
  });

  // Closing drops the paint tool so the map can't stay stuck in a hidden mode.
  const setIsPanelOpen = useCallback((isOpen: boolean) => {
    setIsPanelOpenState(isOpen);
    if (!isOpen) {
      setHeatBrush((brush: HeatBrush) => ({ ...brush, tool: HeatTool.None }));
    }
    try {
      localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(isOpen));
    } catch {
      // Storage blocked: the panel just won't remember its state.
    }
  }, []);

  const setLevelMode = useCallback((mode: LevelMode) => {
    setLevelModeState(mode);
    try {
      localStorage.setItem(LEVEL_MODE_STORAGE_KEY, String(mode));
    } catch {
      // Storage blocked: the level mode just won't be remembered.
    }
  }, []);

  const setIsPaused = useCallback(
    (isPausedNext: boolean) => {
      world.paused = isPausedNext;
      setIsPausedState(isPausedNext);
    },
    [world]
  );

  const setSpeed = useCallback(
    (speedNext: number) => {
      world.speed = speedNext;
      setSpeedState(speedNext);
    },
    [world]
  );

  const setDriverCount = useCallback(
    (count: number) => {
      world.setDriverCount(count);
      setDriverCountState(count);
    },
    [world]
  );

  const contextValue = useMemo<ControlsContextValue>(
    () => ({
      isPanelOpen,
      setIsPanelOpen,
      isPaused,
      setIsPaused,
      speed,
      setSpeed,
      driverCount,
      setDriverCount,
      isGridVisible,
      setIsGridVisible,
      isParentOutlinesVisible,
      setIsParentOutlinesVisible,
      levelMode,
      setLevelMode,
      currentLevel,
      setCurrentLevel,
      isHeatVisible,
      setIsHeatVisible,
      basemap,
      setBasemap,
      heatBrush,
      setHeatBrush
    }),
    [
      isPanelOpen,
      setIsPanelOpen,
      isPaused,
      setIsPaused,
      speed,
      setSpeed,
      driverCount,
      setDriverCount,
      isGridVisible,
      isParentOutlinesVisible,
      levelMode,
      setLevelMode,
      currentLevel,
      isHeatVisible,
      basemap,
      heatBrush
    ]
  );

  return (
    <ControlsContext.Provider value={contextValue}>
      {children}
    </ControlsContext.Provider>
  );
}

export function useControls(): ControlsContextValue {
  const controls = useContext(ControlsContext);
  if (!controls) {
    throw new Error('useControls must be used inside ControlsProvider');
  }
  return controls;
}
