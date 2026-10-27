# How Mini-Uber works

This app simulates Uber-style ride dispatch on a map of Omaha, and has a second page (`/census`) that maps census population onto the same hexagons. A rail on the left switches between them. This document covers the tools it's built with and the algorithms behind it:
- finding nearby cars
- route finding
- drivers moving toward demand
- the H3 hierarchy on the map
- turning census block groups into hexagons
- police incidents and crime rates on hexagons

Everything runs in the browser except the optional Claude call.

## Tools

### App framework
- **Next.js 15 with React 19 and TypeScript:** the page and its components. It also has one server route, `/api/driver-decision`, used only for Claude-powered drivers.
- **yarn, ESLint and Prettier:** package management, linting and code formatting.

### Map
- **[Leaflet](https://leafletjs.com):** the map itself, covering pan and zoom, car markers, hexagon polygons, route lines and popups.
- **[MapLibre GL](https://maplibre.org):** draws the smooth vector basemap tiles inside Leaflet, through the `@maplibre/maplibre-gl-leaflet` bridge.
- **[OpenFreeMap](https://openfreemap.org):** free basemap tiles built from OpenStreetMap data. The Positron, Dark, Fiord, Liberty and Bright styles come from here.

### Hexagon grid
- **[h3-js](https://h3geo.org):** Uber's own H3 hexagonal grid system, and the core of the simulation. It turns a lat/lng into a hexagon ID and finds the rings of hexagons around a cell. It also measures distance in hexagons and gives each hexagon's outline for drawing.
- **Two sizes:** resolution 8, about 0.74 km² per hex, is used for dispatch. Resolution 9, about 0.1 km² per hex, is used for demand heat.
- **Three levels on the map:** what is drawn follows the zoom. Res 7 (about 5.2 km²) shows the whole city, res 8 is the default view and res 9 is street level. See [4. The H3 hierarchy on the map](#4-the-h3-hierarchy-on-the-map).

### Roads and routes
- **[OSRM](https://project-osrm.org) public demo server:** real turn-by-turn road routes for the rider's trip and for a driver heading to a pickup.
- **Built-in road graph:** about 1.2 MB of Omaha's main roads, stored in `src/lib/sim/data/roads.json`. It was taken once from **OpenStreetMap** with the **Overpass API**, and `yarn roads` rebuilds it. Roaming cars drive on it.

### Census data
- **[TIGERweb](https://tigerweb.geo.census.gov) (U.S. Census Bureau):** the Bureau's public map service. Its 2020 Census block-group layer comes with each group's population (`POP100`) and housing-unit count (`HU100`), so one request returns both the shapes and the numbers, with no API key. `yarn census` downloads it once into `src/lib/census/data/`.
- **[Omaha Police Department incident data](https://police.cityofomaha.org/crime-information/incident-data-download):** a public CSV for each year from 2015 onward, with one row per offense. Each row has a block-level latitude and longitude. `yarn crime` downloads 2025 into `src/lib/census/data/crime2025.json`; `--year` picks another year.
- **The Census data API** (api.census.gov), where American Community Survey figures such as income and age live, now requires a free key. It isn't used yet.

### UI and styling
- **Tailwind CSS 4:** with the design tokens in `src/app/globals.css`. `clsx` and `tailwind-merge` sit behind the `cn()` helper, and `tw-animate-css` provides animations.
- **[lucide-react](https://lucide.dev):** all the UI icons (pause, sliders, paintbrush, eraser and so on).
- **Inter and Poppins:** fonts loaded through `next/font`.

### AI (optional)
- **Anthropic SDK and zod:** with `ANTHROPIC_API_KEY` in `.env.local`, a car can be made "Claude-powered". Claude (`claude-haiku-5-5`) then decides whether to accept each ride offer, and gives an in-character reason. zod checks the request and the response.
- **Cost:** this is the only part of the app that costs money. Without a key, every driver uses the free rule-based logic.

## 1. Finding nearby cars: ring search on H3 hexagons

Code: [`src/lib/sim/dispatch.ts`](src/lib/sim/dispatch.ts), [`src/lib/sim/locationIndex.ts`](src/lib/sim/locationIndex.ts)

### Step 1: always know which hexagon each car is in
On every animation frame, each car's position is turned into its res-8 hexagon ID. A lookup table keeps the hexagon → set of cars in it current. So "who is in this hexagon?" is answered instantly, without scanning every car.

### Step 2: search outward one ring at a time from the rider
- `gridDiskDistances(pickupCell, 10)` returns the rider's hexagon (ring 0), then the 6 around it (ring 1), then the 12 around those (ring 2), and so on up to ring 10.
- Each ring is checked for cars that are:
  - idle
  - of the requested category (UberX, Priority, Comfort, UberXL)
  - not already declined this ride
- The first ring with any match wins. If it holds several matching cars, the one closest in straight-line distance is chosen.
- Rings are checked 350 ms apart so you can watch the search spread on the map. A real dispatcher would check them all at once.

### Step 3: an exclusive offer
- The chosen car is marked "offered" and has 15 seconds to answer.
- The rule-based driver waits 2 to 14 seconds, then rolls against its own acceptance chance. That chance is lower if the pickup is over 4 km away and higher for fares over $30. About 8% of the time the driver never answers.
- If the driver declines or times out, the car is added to `declinedBy` and the search restarts from ring 0.
- If nobody is found within 10 rings, it waits 4 seconds, clears the declined list and tries again.

### Quotes
The "Choose a ride" screen uses the same ring search without sending offers. The pickup ETA is a rough estimate: straight-line distance × 1.35 to allow for road detours, at about 10 m/s.

This is the main idea behind real Uber dispatch: hexagon cells turn "find nearby drivers" into a few quick table lookups.

## 2. Path finding from pickup to destination

Code: [`src/lib/sim/routing/osrm.ts`](src/lib/sim/routing/osrm.ts), [`src/lib/sim/routing/roads.ts`](src/lib/sim/routing/roads.ts)

There are three fallback levels:

1. **OSRM (first choice).** The app asks the public OSRM server for a driving route and gets back the road geometry, distance and duration. OSRM uses Contraction Hierarchies, a precomputed shortcut graph built for very fast shortest-path queries on real road networks.
2. **The app's own A\* over the built-in road graph.** If OSRM is down or takes longer than 6 seconds:
   - Snap the start and end to the nearest road nodes. Road nodes are grouped by hexagon, so this only checks the nearby ones.
   - Run **A\***: explore roads in order of drive time so far plus an estimate of the time left. The estimate is the straight-line distance divided by the fastest road speed, so it never overestimates and the path found is the fastest.
   - Rebuild the route by walking back from the goal and following the shape of each road segment.
3. **Hexagon path (last resort).** `gridPathCells` draws a line of hexagons from A to B and the car moves through their centers at a fixed speed.

### Moving cars along the route
A `PathFollower` (in [`src/lib/sim/geo.ts`](src/lib/sim/geo.ts)) precomputes the length along the route at every point. Each frame it places the car the right fraction along the route for the time elapsed, and sets its heading from the current road segment.

### Route hexes
The blue "route hexes" on the map are the res-8 hexagons the route passes through. Gaps between route points are filled with hexagon lines, so the strip has no holes.

## 3. Drivers moving toward the "heat"

Code: [`src/lib/sim/heat.ts`](src/lib/sim/heat.ts), `pickRoam` in [`src/lib/sim/world.ts`](src/lib/sim/world.ts), tuning values in `DEMAND` in [`src/lib/sim/config.ts`](src/lib/sim/config.ts)

### The demand map
Each of the 4,122 res-9 hexagons holds a demand value from 0 to 1.

**Randomize:**
- Gives about 35% of cells a faint background of 0.03 to 0.12.
- Drops 8 to 14 hot spots, about half of them on real pickup locations and the rest anywhere in the city. Each has a random radius of 2 to 6 rings and a random peak of 0.45 to 1.
- Shapes each hot spot as a soft circle, `peak × e^(−2.5·d²)`, where `d` is the distance from its center in hexagon rings divided by its radius. Where spots overlap, the higher value is kept.

**Paint and Erase** add or subtract demand that fades out from the brush center over its rings.

**Saving:** the map is saved in the browser's localStorage (`mini-uber.heat.v1`) and comes back after a reload.

### Where an idle car goes next
Each time a car finishes a roam, it picks a target:

1. **15% of the time it ignores demand** and roams to a random nearby spot. This keeps some cars in quiet areas.
2. **Otherwise it collects candidates:** every res-9 hexagon within 12 rings (about 2 km), plus 40 random hot hexagons from anywhere in the city.
3. **It scores each candidate:**

   ```
   score = demand² ÷ (1 + 1.5 × idle cars already in or heading to that area) ÷ (1 + km away / 2.5)
   ```

   - **demand²** makes hot spots matter much more than lukewarm ones.
   - **The crowding term** keeps cars from flocking: each idle car already in or heading to a res-8 area lowers the pull of every hexagon in it. Once a few cars have claimed a hot spot, the next car finds a less crowded one more attractive.
   - **The distance term** halves a hexagon's pull at 2.5 km, so cars prefer heat close by.
4. **It picks one of the top 6 at random, weighted by score**, rather than always taking the best. This spreads cars across several hot spots instead of having them all race to the same one.
5. **It drives there with A\*** on the road graph, and records that hexagon as its `roamCell` so other cars can count it as "heading there".

### Reacting in real time
When demand changes (Randomize, Clear or painting), every idle car gets a re-plan time spread over the next 3 seconds. At that time it drops its current roam and picks a new target. That's why cars turn toward new heat one by one rather than all at once.

Only idle cars are affected. Cars with an offer, heading to a pickup or on a trip carry on.

### The result
Measured in the running app:
- Hot hexagons cover about 6% of the city but end up holding roughly 40–60% of the cars.
- Each part of the map gets about its share of the demand in cars, and no single hot spot takes the whole fleet.
- If you paint only one hot spot, about half the fleet heads there and the rest stay spread out.

## 4. The H3 hierarchy on the map

Code: `cellsAtLevel`, `total` and `intensity` in [`src/lib/sim/heat.ts`](src/lib/sim/heat.ts), and the level handling in [`src/components/map/mapView.ts`](src/components/map/mapView.ts)

### Parents and children
- **Seven children:** every H3 cell has about 7 children one resolution finer. `cellToParent` goes up a level and `cellToChildren` goes down.
- **Imperfect nesting:** each level is rotated slightly, so the children don't fit the parent's outline exactly. Some poke a little past its edge.
- **IDs vs geometry:** the hierarchy is defined by cell IDs, not by shapes. A res-9 cell belongs to exactly one res-8 parent even where it sticks out.

### What the map shows at each zoom
| Zoom | Level drawn | Outlined in bold |
|---|---|---|
| 11 or less | res 7 (103 cells) | none |
| 12–13 | res 8 (627 cells) | res-7 parents |
| 14 or more | res 9 (4,122 cells) | res-8 parents |

- **Level switches:** each level has its own map layers. Crossing a threshold crossfades them, so the finer cells seem to appear out of their parent.
- **Fixed level:** the "Grid level" control can lock the map to one level.
- **Hover:** hovering a cell outlines its parent and its children. The info box shows the chain of IDs from res 7 down to the current level.

### Demand at each level
- **Base data:** demand is only stored at res 9.
- **Totals:** a res-8 or res-7 cell's demand is the **sum** of its res-9 children. It is updated incrementally whenever a res-9 value changes.
- **Sum, not average:** a parent full of busy streets should outrank one with a single hot corner. An average would make them look the same.
- **Colour:** set by the cell's **share of the busiest cell at that level** (`intensity`), so the most important area is the darkest at every zoom. Otherwise totals at res 7 (up to about 18) would dwarf res-9 values (0–1).
- **Painting:** the brush works at the level on screen. A dab on a res-7 cell raises all of its roughly 40–49 res-9 children at once.

## 5. Census block groups to hexagons

Code: [`scripts/build-census.mjs`](scripts/build-census.mjs) and [`src/lib/census/hexData.ts`](src/lib/census/hexData.ts). The page is in [`src/components/census/`](src/components/census/).

### The source
- **Block groups:** the smallest areas the Census Bureau publishes detailed counts for, usually 600 to 3,000 people. They follow streets, rivers and other boundaries, so their shapes and sizes vary a lot.
- **This area:** 470 block groups touch the simulator's area. 438 are in Douglas County, NE and 32 in Pottawattamie County, IA (Council Bluffs). Together they hold 549,436 people (2020 Census).

### Moving the counts onto hexagons
1. **Assign cells:** `polygonToCells` gives every res-9 hexagon whose centre falls inside a block group. Each hexagon belongs to exactly one block group.
2. **Split evenly:** a block group's population is divided equally among its hexagons. This assumes people are spread evenly within a block group, a standard method called areal weighting.
3. **Tiny block groups:** any block group too small to contain a hexagon centre would give all its people to the hexagon at its centre point. None of the 470 needed it.
4. **Roll up:** res-8 and res-7 values are sums of their res-9 children, as with demand on the simulator.
5. **Check:** the total is 549,436 at every level. That is 7,424 hexes at res 9, 1,135 at res 8 and 187 at res 7.

Whole block groups are kept, even where they extend past the simulator's box, so the hex grid reaches a little further than the simulator's.

### Showing it
- **Colour bands (default):** 5 bands with an equal number of hexes in each (quantiles), worked out separately at each level. Population is very uneven, so a straight scale would leave most of the city pale.
- **Other scales:** Linear and Square root are also offered.
- **Ramp:** light mint to deep blue. It is reversed on dark basemaps so that busy areas glow.
- **Hover:** shows a hex's people, its band, its share of the busiest hex, and the block groups its people came from.
- **Block-group outlines:** can be drawn over the hexes to compare the census's own shapes with the grid.

## 6. Police incidents and crime rates

Code: [`scripts/build-crime.mjs`](scripts/build-crime.mjs), and `buildHexLayer` and `cellDetails` in [`src/lib/census/hexData.ts`](src/lib/census/hexData.ts)

### From offense rows to hexagons
- **Cases, not rows:** the 2025 file has 45,191 offense rows, which make up 39,298 cases (case numbers). A case with several offenses counts once overall, and once in each category it touches.
- **Locations:** OPD rounds each location to the block (e.g. "900 Jones St"). `latLngToCell` turns that point straight into a res-9 hexagon, so no splitting is needed, unlike block groups.
- **Dropped:** 733 cases have no location and 856 fall outside the census page's hexagons. That leaves 37,709.
- **Categories,** matched on the offense description:
  - **Violent:** homicide, assault, robbery, sexual assault, kidnapping, intimidation, terroristic threats
  - **Property:** theft, shoplifting, motor vehicle theft, burglary, vandalism, arson, fraud
  - **Other offenses:** trespass, harassment, protection orders, child neglect and similar
  - **Non-criminal calls:** sickness, overdoses, deaths, injuries, lost property. These are left out of "All crimes" unless the switch is on.
  - The 2025 file has no drug or weapons offenses.
- **Check:** the script stops if the hexagon totals don't equal the number of cases kept. For All crimes that is 30,816 at every level.

### Counts vs rates
- **Incidents:** counts that add up from res 9 to res 8 and res 7, like population.
- **Incidents per 1,000 residents:** at each level this is 1,000 × the cell's total incidents ÷ the cell's total residents. Both totals are summed first, because rates don't add up the way counts do. Across Omaha it comes to 59.4 per 1,000 for All crimes.
- **Minimum residents:** a cell needs at least 50 residents at res 9, 200 at res 8 or 1,000 at res 7 to show a rate.
  - Below that it's drawn as "too few residents". A mall or downtown block with a handful of residents and hundreds of thefts would otherwise top the scale.
  - Even with the cutoff, the top band at res 9 runs into the thousands.
- **Years differ:** the rate divides 2025 incidents by 2020 residents.
- **Coverage:** OPD only covers Douglas County, NE. Council Bluffs hexagons show as "no data", not zero.
- **Colour bands:** crime-free cells would fill the lowest bands with "0–0", so the bands are computed over non-zero cells only and zero goes in the first band.
