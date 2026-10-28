'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { z } from 'zod';
import { createApp, type App } from '@/lib/sim/app';
import { createEventBus, type EventBus, type SimEvent } from '@/lib/sim/events';
import { createWorld, type World } from '@/lib/sim/world';

type FrameCallback = (now: number) => void;

const HEAT_STORAGE_KEY: string = 'mini-uber.heat.v1';
const HEAT_SAVE_DEBOUNCE_MS: number = 500;
const savedHeatSchema = z.record(z.string(), z.number());

/** Replaces the random demand map with the saved one, if there is one. */
function loadSavedHeat(world: World): void {
  try {
    const raw: string | null = localStorage.getItem(HEAT_STORAGE_KEY);
    if (raw === null) return;
    const parsed = savedHeatSchema.safeParse(JSON.parse(raw));
    if (parsed.success) world.heat.load(parsed.data);
  } catch {
    // Storage blocked or corrupt: keep the random map.
  }
}

interface SimulationEngine {
  bus: EventBus;
  world: World;
  app: App;
}

interface SimulationContextValue extends SimulationEngine {
  llmEnabled: boolean;
  /** Runs `callback` every animation frame, right after `world.tick`. */
  registerFrame: (callback: FrameCallback) => () => void;
}

interface SimulationProviderProps {
  llmEnabled: boolean;
  children: ReactNode;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export default function SimulationProvider({
  llmEnabled,
  children
}: SimulationProviderProps) {
  // Lazy init keeps one engine for the component's lifetime (StrictMode
  // reuses the kept state on its simulated remount).
  const [engine] = useState<SimulationEngine>(() => {
    const bus: EventBus = createEventBus();
    const world: World = createWorld();
    loadSavedHeat(world);
    return { bus, world, app: createApp(world, bus) };
  });
  const frameCallbacksRef = useRef<Set<FrameCallback>>(new Set());

  const registerFrame = useCallback((callback: FrameCallback) => {
    frameCallbacksRef.current.add(callback);
    return () => {
      frameCallbacksRef.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    let last: number = performance.now();
    let rafId: number = requestAnimationFrame(function loop(now: number) {
      engine.world.tick((now - last) / 1000);
      last = now;
      frameCallbacksRef.current.forEach((callback) => callback(now));
      rafId = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(rafId);
  }, [engine]);

  // Save the demand map shortly after each edit; flush a pending save on unmount.
  useEffect(() => {
    const { heat } = engine.world;
    let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const saveHeat = () => {
      saveTimeoutId = null;
      try {
        localStorage.setItem(HEAT_STORAGE_KEY, JSON.stringify(heat.toJSON()));
      } catch {
        // Storage full or blocked: painting still works, it just won't persist.
      }
    };
    const unsubscribe = heat.onChange(() => {
      if (saveTimeoutId !== null) clearTimeout(saveTimeoutId);
      saveTimeoutId = setTimeout(saveHeat, HEAT_SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (saveTimeoutId !== null) {
        clearTimeout(saveTimeoutId);
        saveHeat();
      }
    };
  }, [engine]);

  useEffect(() => {
    // Handy for poking at the simulation from devtools.
    if (process.env.NODE_ENV === 'development') {
      Object.assign(window, engine);
    }
  }, [engine]);

  const contextValue = useMemo<SimulationContextValue>(
    () => ({ ...engine, llmEnabled, registerFrame }),
    [engine, llmEnabled, registerFrame]
  );

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation(): SimulationContextValue {
  const simulation = useContext(SimulationContext);
  if (!simulation) {
    throw new Error('useSimulation must be used inside SimulationProvider');
  }
  return simulation;
}

/** Subscribes to every bus event for the component's lifetime. */
export function useSimEvent(handler: (event: SimEvent) => void): void {
  const { bus } = useSimulation();
  const handlerRef = useRef<(event: SimEvent) => void>(handler);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const unsubscribe = bus.on((event) => handlerRef.current(event));
    return () => {
      unsubscribe();
    };
  }, [bus]);
}
