import { CATEGORIES, PRICING } from '@/lib/sim/config';
import type { Category, Route } from '@/lib/sim/types';

export function fareFor(category: Category, route: Route): number {
  const km = route.distanceM / 1000;
  const min = route.durationS / 60;
  const raw = PRICING.base + PRICING.perKm * km + PRICING.perMin * min;
  const fare = Math.max(
    PRICING.minimum,
    raw * CATEGORIES[category].multiplier + PRICING.bookingFee
  );
  return Math.round(fare * 100) / 100;
}
