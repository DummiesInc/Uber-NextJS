# How Mini-Uber works

This app simulates Uber-style ride dispatch on a map of Omaha. This document covers the tools it's built with and the three algorithms behind it:
- finding nearby cars
- route finding
- drivers moving toward demand

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

### Roads and routes
- **[OSRM](https://project-osrm.org) public demo server:** real turn-by-turn road routes for the rider's trip and for a driver heading to a pickup.
- **Built-in road graph:** about 1.2 MB of Omaha's main roads, stored in `src/lib/sim/data/roads.json`. It was taken once from **OpenStreetMap** with the **Overpass API**, and `yarn roads` rebuilds it. Roaming cars drive on it.

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
