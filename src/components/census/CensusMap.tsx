'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CensusMapView,
  type CensusCellHover,
  type CensusMapSettings
} from '@/components/census/censusMapView';
import CensusHoverBox from '@/components/census/CensusHoverBox';
import { useCensusControls } from '@/components/census/CensusControlsProvider';

/** The census Leaflet map; Leaflet owns the map DOM, React owns overlays. */
export default function CensusMap() {
  const {
    hexLayer,
    levelMode,
    setCurrentLevel,
    colorScale,
    opacity,
    isHexOutlinesVisible,
    isBlockGroupOutlinesVisible,
    basemap
  } = useCensusControls();
  const mapElRef = useRef<HTMLDivElement>(null);
  const [mapView, setMapView] = useState<CensusMapView | null>(null);
  const [cellHover, setCellHover] = useState<CensusCellHover | null>(null);

  // The view is built once with the settings of its first render; the
  // effects below push later changes through its setters.
  const initialSettingsRef = useRef<CensusMapSettings>({
    layer: hexLayer,
    levelMode,
    colorScale,
    opacity,
    isHexOutlinesVisible,
    isBlockGroupOutlinesVisible,
    basemap
  });

  useEffect(() => {
    const mapEl: HTMLDivElement | null = mapElRef.current;
    if (!mapEl) return;
    const censusMapView: CensusMapView = new CensusMapView(
      mapEl,
      initialSettingsRef.current,
      { onLevelChange: setCurrentLevel, onCellHover: setCellHover }
    );
    setMapView(censusMapView);
    return () => {
      setMapView(null);
      censusMapView.destroy();
    };
  }, [setCurrentLevel]);

  useEffect(() => {
    mapView?.setLayer(hexLayer);
  }, [mapView, hexLayer]);

  useEffect(() => {
    mapView?.setLevelMode(levelMode);
  }, [mapView, levelMode]);

  useEffect(() => {
    mapView?.setColorScale(colorScale);
  }, [mapView, colorScale]);

  useEffect(() => {
    mapView?.setOpacity(opacity);
  }, [mapView, opacity]);

  useEffect(() => {
    mapView?.setHexOutlinesVisible(isHexOutlinesVisible);
  }, [mapView, isHexOutlinesVisible]);

  useEffect(() => {
    mapView?.setBlockGroupOutlinesVisible(isBlockGroupOutlinesVisible);
  }, [mapView, isBlockGroupOutlinesVisible]);

  useEffect(() => {
    mapView?.setBasemap(basemap);
  }, [mapView, basemap]);

  return (
    <>
      <div ref={mapElRef} className="census-map absolute inset-0" />
      <CensusHoverBox cellHover={cellHover} hexLayer={hexLayer} />
    </>
  );
}
