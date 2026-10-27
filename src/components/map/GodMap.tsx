'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { PERSONAS } from '@/lib/sim/drivers/personas';
import type { Driver } from '@/lib/sim/driver';
import {
  MapView,
  type CellHoverInfo,
  type DriverPopupTarget
} from '@/components/map/mapView';
import CellInfo from '@/components/map/CellInfo';
import DriverPopup from '@/components/map/DriverPopup';
import { useSimulation } from '@/components/providers/SimulationProvider';
import { useControls } from '@/components/providers/ControlsProvider';

/** The god-view Leaflet map; Leaflet owns the map DOM, React owns overlays. */
export default function GodMap() {
  const { world, bus, llmEnabled, registerFrame } = useSimulation();
  const {
    isGridVisible,
    isParentOutlinesVisible,
    levelMode,
    setCurrentLevel,
    isHeatVisible,
    basemap,
    heatBrush
  } = useControls();
  const mapElRef = useRef<HTMLDivElement>(null);
  const nextPersonaIndexRef = useRef<number>(0);
  const [cellHover, setCellHover] = useState<CellHoverInfo | null>(null);
  const [driverPopup, setDriverPopup] = useState<DriverPopupTarget | null>(
    null
  );
  const [mapView, setMapView] = useState<MapView | null>(null);
  const [popupRevision, setPopupRevision] = useState<number>(0);

  useEffect(() => {
    const mapEl: HTMLDivElement | null = mapElRef.current;
    if (!mapEl) return;
    const mapView: MapView = new MapView(mapEl, world, bus, {
      onCellHover: setCellHover,
      onLevelChange: setCurrentLevel,
      onDriverPopupOpen: setDriverPopup,
      onDriverPopupClose: (driver: Driver) =>
        setDriverPopup((open) => (open?.driver === driver ? null : open))
    });
    const unregisterFrame = registerFrame((now: number) => mapView.frame(now));
    setMapView(mapView);
    return () => {
      unregisterFrame();
      setMapView(null);
      mapView.destroy();
    };
  }, [world, bus, registerFrame, setCurrentLevel]);

  // MapView is recreated on remount, so re-apply the map settings to it.
  useEffect(() => {
    mapView?.setGridVisible(isGridVisible);
  }, [mapView, isGridVisible]);

  useEffect(() => {
    mapView?.setParentOutlinesVisible(isParentOutlinesVisible);
  }, [mapView, isParentOutlinesVisible]);

  useEffect(() => {
    mapView?.setLevelMode(levelMode);
  }, [mapView, levelMode]);

  useEffect(() => {
    mapView?.setHeatVisible(isHeatVisible);
  }, [mapView, isHeatVisible]);

  useEffect(() => {
    mapView?.setBasemap(basemap);
  }, [mapView, basemap]);

  useEffect(() => {
    mapView?.setHeatBrush(heatBrush);
  }, [mapView, heatBrush]);

  // Leaflet measured the popup before React filled it, so re-layout it.
  useLayoutEffect(() => {
    driverPopup?.popup.update();
  }, [driverPopup, popupRevision]);

  const handleToggleDriverBrain = (driver: Driver) => {
    if (!llmEnabled) return;
    if (driver.brain === 'llm') {
      driver.brain = 'rule';
    } else {
      driver.brain = 'llm';
      driver.persona =
        PERSONAS[nextPersonaIndexRef.current++ % PERSONAS.length];
    }
    setPopupRevision((revision) => revision + 1);
  };

  // Built outside JSX because createPortal needs the narrowed target.
  const driverPopupPortal: ReactNode = driverPopup
    ? createPortal(
        <DriverPopup
          driver={driverPopup.driver}
          llmEnabled={llmEnabled}
          onToggleBrain={handleToggleDriverBrain}
        />,
        driverPopup.container
      )
    : null;

  return (
    <>
      <div ref={mapElRef} id="map" className="god-map absolute inset-0" />
      <CellInfo cellHover={cellHover} />
      {driverPopupPortal}
    </>
  );
}
