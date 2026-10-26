'use client';

import dynamic from 'next/dynamic';

// Leaflet, MapLibre and the road graph all need `window`, so the whole
// simulation renders on the client only.
const SimulationApp = dynamic(
  () => import('@/components/modules/SimulationApp'),
  { ssr: false }
);

export default function SimulationClient({
  llmEnabled
}: {
  llmEnabled: boolean;
}) {
  return <SimulationApp llmEnabled={llmEnabled} />;
}
