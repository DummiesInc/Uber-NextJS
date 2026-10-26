import L from 'leaflet';
import type { Driver } from '@/lib/sim/driver';
import type { Category } from '@/lib/sim/types';

export const CAT_TAG: Record<Category, string> = {
  UberX: 'X',
  Priority: 'P',
  Comfort: 'C',
  UberXL: 'XL'
};

/** Category badge colours, shared by car tags, the driver popup and avatars. */
export const CAT_BADGE: Record<Category, string> = {
  UberX: 'bg-teal-60 text-fg-alternate',
  Priority: 'bg-yellow-50 text-fg-primary',
  Comfort: 'bg-blue-60 text-fg-alternate',
  UberXL: 'bg-orange-50 text-fg-alternate'
};

const RING_R = 19;
export const RING_C = 2 * Math.PI * RING_R;

// State-driven pieces (.ring/.timer visibility, ring + timer colours, paint)
// live in the globals.css components layer; see the note there.
const CAR_SVG = `<svg class="car-svg block size-full" viewBox="0 0 20 34" aria-hidden="true">
  <rect x="2" y="1" width="16" height="32" rx="6" class="car-paint fill-(--paint) stroke-gray-90 stroke-1"/>
  <rect x="4" y="8" width="12" height="6" rx="2" class="fill-gray-90" opacity=".7"/>
  <rect x="4" y="24" width="12" height="4" rx="1.5" class="fill-gray-90" opacity=".55"/>
</svg>`;

export function carIcon(d: Driver): L.DivIcon {
  return L.divIcon({
    className: 'car-marker',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div class="car" data-cat="${d.category}">
      <svg class="ring absolute inset-0 size-full -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle class="ring-bg fill-gray-90/55 stroke-stroke-alternate/25 stroke-4" cx="22" cy="22" r="${RING_R}"/>
        <circle class="ring-fg fill-none stroke-4 transition-[stroke-dashoffset] duration-100 ease-linear" stroke-linecap="round" cx="22" cy="22" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/>
      </svg>
      <div class="car-body absolute top-2.25 left-3.75 h-6.5 w-3.5 origin-center drop-shadow-md">${CAR_SVG}</div>
      <span class="cat-tag absolute -right-0.5 bottom-0.5 min-w-4 rounded-sm border border-stroke-alternate/60 px-0.5 text-center font-inter text-fluid-xs leading-3.5 font-bold ${CAT_BADGE[d.category]}">${CAT_TAG[d.category]}</span>
      <span class="llm-badge absolute -top-0.5 -left-0.5 text-fluid-s">✨</span>
      <span class="timer absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border px-1.5 font-inter text-fluid-xs font-bold tabular-nums"></span>
    </div>`
  });
}

export const personIcon = L.divIcon({
  className: 'person-marker',
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  html: `<div class="person text-fluid-xl leading-none drop-shadow-md"><span class="inline-block animate-bob">🧍</span></div>`
});

export const destIcon = L.divIcon({
  className: 'dest-marker',
  iconSize: [34, 34],
  iconAnchor: [8, 30],
  html: `<div class="dest text-fluid-xl leading-none drop-shadow-md"><span>🏁</span></div>`
});
