import type { Metadata } from 'next';
import CensusClient from '@/components/census/CensusClient';

export const metadata: Metadata = {
  title: 'Census on H3 · Omaha',
  description:
    '2020 Census population of Omaha and Council Bluffs on the H3 hexagon grid'
};

export default function CensusPage() {
  return <CensusClient />;
}
