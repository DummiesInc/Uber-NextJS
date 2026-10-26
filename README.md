# Mini-Uber · Omaha on H3 (Next.js)

A small simulation of Uber-style ride dispatch on Uber's [H3](https://h3geo.org) hexagon grid, ported from the Vite version in `~/Documents/Uber`.

- **Left:** a "god view" map of Omaha showing the H3 grid, roaming drivers, the ring-by-ring driver search, 15-second exclusive offers and the trip lifecycle.
- **Right:** a phone-style rider app. You pick a pickup, choose UberX / Priority / Comfort / UberXL, and ride to 17041 Lakeside Hills Plaza.

## Run it

```bash
yarn install
yarn dev
```

Open http://localhost:4000.

### Optional: Claude-powered drivers

Put `ANTHROPIC_API_KEY=...` in `.env.local` and restart. Click a car and choose **✨ Make Claude-powered**. The browser calls `/api/driver-decision`, and the server calls Claude with the key, so the key never reaches the client.

## Layout

| Area | Where |
|---|---|
| Simulation engine (H3 index, dispatch, drivers, routing) | `src/lib/sim/` |
| Claude decision route | `src/app/api/driver-decision/route.ts` |
| Sim loop and event bus context | `src/components/providers/SimulationProvider.tsx` |
| God-view map, feed, stepper | `src/components/map/` |
| Rider phone | `src/components/phone/` |
| Design tokens | `src/app/globals.css` (see `agents/STYLING.md`) |

To refresh the road graph from OpenStreetMap, run `yarn roads`.
