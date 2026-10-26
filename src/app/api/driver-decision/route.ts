import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DriverDecisionRequest } from '@/lib/sim/drivers/llmBrain';
import { CATEGORY_LIST } from '@/lib/sim/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CategorySchema = z.enum(CATEGORY_LIST);

const RequestSchema = z.object({
  offer: z.object({
    rideId: z.number(),
    category: CategorySchema,
    pickupName: z.string(),
    pickupCells: z.number(),
    pickupKm: z.number(),
    tripKm: z.number(),
    tripMin: z.number(),
    fare: z.number()
  }),
  driver: z.object({
    name: z.string(),
    category: CategorySchema,
    car: z.string(),
    trips: z.number(),
    earnings: z.number(),
    persona: z.string().nullable()
  })
}) satisfies z.ZodType<DriverDecisionRequest>;

const DecisionSchema = z.object({
  accept: z.boolean(),
  reason: z
    .string()
    .describe('One short first-person sentence, under 15 words.')
});

export async function POST(request: Request) {
  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: body.error.issues },
      { status: 400 }
    );
  }
  const { offer, driver } = body.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  try {
    const response = await client.messages.parse(
      {
        model: 'claude-haiku-5-5',
        max_tokens: 1024,
        system:
          `You are ${driver.name}, an Uber ${driver.category} driver in Omaha, Nebraska, driving a ${driver.car}. ` +
          `${driver.persona ?? ''} ` +
          'A ride request has just popped up on your phone. Decide whether to accept it, the way this driver really would.',
        messages: [
          {
            role: 'user',
            content:
              `Ride offer:\n` +
              `- Pickup: ${offer.pickupName}, ${offer.pickupKm.toFixed(1)} km from you (${offer.pickupCells} H3 cells away)\n` +
              `- Drop-off: Lakeside Hills Plaza, west Omaha (168th & Center)\n` +
              `- Trip: ${offer.tripKm.toFixed(1)} km, about ${Math.round(offer.tripMin)} min\n` +
              `- Fare: $${offer.fare.toFixed(2)}\n` +
              `So far today: ${driver.trips} trips, $${driver.earnings.toFixed(2)} earned.`
          }
        ],
        output_config: {
          format: zodOutputFormat(DecisionSchema),
          effort: 'low'
        }
      },
      { timeout: 12_000 }
    );
    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `No structured output (stop_reason: ${response.stop_reason})`
      );
    }
    return NextResponse.json({
      accept: parsed.accept,
      reason: parsed.reason
    });
  } catch (err) {
    console.warn(`driver-decision failed for ${driver.name}`, err);
    return NextResponse.json(
      { error: 'Driver decision unavailable' },
      { status: 502 }
    );
  }
}
