import SimulationClient from '@/components/modules/SimulationClient';

// Read the API key per request, not at build time, so adding a key later
// enables Claude drivers without a rebuild.
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <SimulationClient llmEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
  );
}
