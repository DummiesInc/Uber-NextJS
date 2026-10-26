import type { Driver } from '@/lib/sim/driver';
import type { Decision, Offer } from '@/lib/sim/types';
import { ruleDecide } from '@/lib/sim/drivers/ruleBrain';

/** What /api/driver-decision expects. The server adds the API key and calls Claude. */
export interface DriverDecisionRequest {
  offer: Offer;
  driver: {
    name: string;
    category: Driver['category'];
    car: string;
    trips: number;
    earnings: number;
    persona: string | null;
  };
}

/** Claude-powered driver: decides in character, falls back to rules on any error. */
export async function llmDecide(
  offer: Offer,
  driver: Driver
): Promise<Decision> {
  const body: DriverDecisionRequest = {
    offer,
    driver: {
      name: driver.name,
      category: driver.category,
      car: driver.car,
      trips: driver.trips,
      earnings: driver.earnings,
      persona: driver.persona?.description ?? null
    }
  };
  try {
    const res = await fetch('/api/driver-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(13_000)
    });
    if (!res.ok) throw new Error(`driver-decision ${res.status}`);
    return (await res.json()) as Decision;
  } catch (err) {
    console.warn(`LLM driver ${driver.name} fell back to rules`, err);
    const d = await ruleDecide(offer, driver);
    return { ...d, reason: `(LLM unavailable) ${d.reason}` };
  }
}

/** The UI only lets a driver become "llm" when the server has an API key. */
export function decide(offer: Offer, driver: Driver): Promise<Decision> {
  return driver.brain === 'llm'
    ? llmDecide(offer, driver)
    : ruleDecide(offer, driver);
}
