import type { Driver } from '@/lib/sim/driver';
import type { Decision, Offer } from '@/lib/sim/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const YES = [
  'On my way!',
  "Good fare, I'll take it.",
  'Close by — accepting.',
  'Sure thing.',
  'West side run, nice.'
];
const NO_FAR = [
  'Pickup is too far away.',
  'Too much unpaid driving to get there.'
];
const NO = [
  'Taking a break.',
  'Not this one.',
  'Grabbing coffee first.',
  'Passing on this trip.'
];

/**
 * Rule-based driver: thinks for 2–14 s, then rolls against its acceptance
 * chance (nudged by pickup distance and fare). ~8% of the time it never
 * answers, which the dispatcher treats as a timeout.
 */
export async function ruleDecide(
  offer: Offer,
  driver: Driver
): Promise<Decision> {
  if (Math.random() < 0.08) {
    await sleep(20_000);
    return { accept: false, reason: 'No response.' };
  }
  await sleep(2_000 + Math.random() * 12_000);
  let p = driver.acceptChance;
  if (offer.pickupKm > 4) p -= 0.15;
  if (offer.fare > 30) p += 0.1;
  p = Math.min(0.97, Math.max(0.05, p));
  if (Math.random() < p) return { accept: true, reason: pick(YES) };
  return {
    accept: false,
    reason: offer.pickupKm > 4 ? pick(NO_FAR) : pick(NO)
  };
}
