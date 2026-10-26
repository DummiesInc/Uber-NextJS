export interface Persona {
  id: string;
  title: string;
  description: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'veteran',
    title: 'Picky veteran',
    description:
      "You've driven for 8 years and know exactly which trips pay. You dislike long unpaid drives to a pickup and short low fares, but you happily take long airport or suburb runs."
  },
  {
    id: 'rookie',
    title: 'Eager rookie',
    description:
      'This is your first week driving. You want to build your rating and accept almost everything, unless the pickup is truly far away.'
  },
  {
    id: 'homeward',
    title: 'End of shift',
    description:
      "You're near the end of a long shift and live in west Omaha (near 168th & Center). You strongly prefer trips heading west toward home, and you're tired of long pickups."
  }
];
