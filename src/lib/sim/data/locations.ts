import type { Place } from '@/lib/sim/types';

/** Pickup spots, geocoded with OpenStreetMap Nominatim. */
export const LOCATIONS: Place[] = [
  {
    name: 'Eppley Airfield',
    area: 'East Omaha',
    lat: 41.3012916,
    lng: -95.8920711
  },
  { name: 'Old Market', area: 'Downtown', lat: 41.2549429, lng: -95.930584 },
  {
    name: 'Henry Doorly Zoo',
    area: 'South Omaha',
    lat: 41.2254737,
    lng: -95.9267318
  },
  {
    name: 'CHI Health Center',
    area: 'NoDo',
    lat: 41.2636669,
    lng: -95.9279385
  },
  {
    name: 'Charles Schwab Field',
    area: 'NoDo',
    lat: 41.2669678,
    lng: -95.9325486
  },
  {
    name: 'Joslyn Art Museum',
    area: 'Downtown',
    lat: 41.2604154,
    lng: -95.946024
  },
  {
    name: 'Gene Leahy Mall',
    area: 'Downtown',
    lat: 41.2579765,
    lng: -95.9298315
  },
  {
    name: 'The Durham Museum',
    area: 'Downtown',
    lat: 41.2513982,
    lng: -95.9280999
  },
  {
    name: 'Bob Kerrey Pedestrian Bridge',
    area: 'Riverfront',
    lat: 41.265539,
    lng: -95.9234013
  },
  {
    name: 'Creighton University',
    area: 'NoDo',
    lat: 41.2658565,
    lng: -95.9450555
  },
  {
    name: "Omaha Children's Museum",
    area: 'Downtown',
    lat: 41.2537,
    lng: -95.9398
  },
  { name: 'UNMC', area: 'Blackstone', lat: 41.2550772, lng: -95.9769529 },
  {
    name: 'Midtown Crossing',
    area: 'Midtown',
    lat: 41.2581874,
    lng: -95.9595038
  },
  { name: 'Turner Park', area: 'Midtown', lat: 41.2587226, lng: -95.958773 },
  {
    name: 'Blackstone District',
    area: 'Blackstone',
    lat: 41.2588,
    lng: -95.9665
  },
  { name: 'Dundee', area: 'Dundee', lat: 41.2650387, lng: -95.9903272 },
  { name: 'Memorial Park', area: 'Dundee', lat: 41.2622829, lng: -96.0027278 },
  { name: 'Elmwood Park', area: 'Elmwood', lat: 41.2549092, lng: -96.005807 },
  {
    name: 'University of Nebraska Omaha',
    area: 'Elmwood',
    lat: 41.2577933,
    lng: -96.0104971
  },
  {
    name: 'Aksarben Village',
    area: 'Aksarben',
    lat: 41.2397787,
    lng: -96.0135341
  },
  { name: 'Baxter Arena', area: 'Aksarben', lat: 41.2361165, lng: -96.0130109 },
  {
    name: 'Crossroads',
    area: 'Central Omaha',
    lat: 41.2625963,
    lng: -96.024832
  },
  {
    name: 'Westroads Mall',
    area: 'West Omaha',
    lat: 41.2665595,
    lng: -96.068278
  },
  {
    name: 'Rockbrook Village',
    area: 'West Omaha',
    lat: 41.232631,
    lng: -96.0837439
  },
  { name: 'Benson', area: 'Benson', lat: 41.2813773, lng: -96.0118795 },
  { name: 'Benson Park', area: 'Benson', lat: 41.2968484, lng: -96.0182205 },
  {
    name: 'Fontenelle Park',
    area: 'North Omaha',
    lat: 41.2958972,
    lng: -95.9830403
  },
  { name: 'Florence', area: 'North Omaha', lat: 41.3368437, lng: -95.9606745 },
  {
    name: 'Hanscom Park',
    area: 'Hanscom Park',
    lat: 41.2421616,
    lng: -95.9580987
  },
  {
    name: 'Lauritzen Gardens',
    area: 'Riverfront',
    lat: 41.236244,
    lng: -95.9165906
  },
  {
    name: 'Historic South 24th Street',
    area: 'South Omaha',
    lat: 41.2072,
    lng: -95.9478
  },
  { name: 'Boys Town', area: 'West Omaha', lat: 41.2545638, lng: -96.1294312 },
  { name: 'Oak View Mall', area: 'Millard', lat: 41.2297175, lng: -96.1341253 }
];

export function randomPlaces(n: number, exclude: Place[] = []): Place[] {
  const pool = LOCATIONS.filter((p) => !exclude.includes(p));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
