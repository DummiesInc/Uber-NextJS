'use client';

import dynamic from 'next/dynamic';

// Leaflet and MapLibre need `window`, so the census page renders on the
// client only.
const CensusApp = dynamic(() => import('@/components/census/CensusApp'), {
  ssr: false
});

export default function CensusClient() {
  return <CensusApp />;
}
