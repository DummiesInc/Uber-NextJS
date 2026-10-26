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
import { App } from '@/lib/sim/app';
import { EventBus, type SimEvent } from '@/lib/sim/events';
import { World } from '@/lib/sim/world';

type FrameCallback = (now: number) => void;

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
    const bus: EventBus = new EventBus();
    const world: World = new World();
    return { bus, world, app: new App(world, bus) };
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
