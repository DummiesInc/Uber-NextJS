# Orchestration summary: Mini-Uber, Vite to Next.js 15

The Mini-Uber simulator from `~/Documents/Uber` was ported to Next.js 15 (App Router, React 19, Tailwind 4, yarn). It behaves like the original, and the styling uses the `globals.css` tokens and `agents/STYLING.md`.

## Phase 0: scaffold and engine (done directly, outside the three skills)
- Scaffolded with `create-next-app@15` and Prettier. `globals.css` moved to `src/app/`. Added `cn` (`src/lib/utils.ts`) and `If` (`src/lib/If.tsx`). Inter and Poppins load through next/font. The dev server runs on port 4000.
- The simulation engine was copied unchanged into `src/lib/sim/`, with imports switched to `@/`. `llmBrain.ts` now calls `/api/driver-decision` instead of a Vite proxy.
- `postinstall` copies the MapLibre worker to `public/`. The app renders only in the browser, through `SimulationClient` with `next/dynamic` and `ssr: false`.

## Skills, in order
1. **api-integration:** `src/app/api/driver-decision/route.ts`. It calls Claude `claude-haiku-5-5` on the server, with the same prompt as the original, and validates requests with Zod. Responses: 400 bad body, 503 no key, 502 Claude call failed, 200 `{accept, reason}`. The commandCenter, DTO and auth parts of the skill were skipped because this app has no backend.
2. **react-component:**
   - `SimulationProvider` runs one simulation loop and is StrictMode-safe. It provides `useSimEvent` and `registerFrame`.
   - `TopBar`, `GodMap` (wraps the existing `MapView` class, now with `destroy()`), `CellInfo`, `DriverPopup` (rendered with a portal), `Stepper`, `Legend` and `DispatchFeed` (JSX, no innerHTML).
   - `Phone` uses a `useReducer` state machine, with `PhoneMap`, six screen components and `DriverCard`.
3. **styling:** Tailwind with semantic and fluid tokens. Category and state colours are remapped to brand scales (teal / yellow / blue / orange). Lucide icons replace UI glyphs. One commented `@layer components` block covers the Leaflet car markers. New animations (`pulse-dot`, `radar`, `enter`, `bob`, `dash`) are in `@theme`. A `Button` atom was added.

## Fixes made during final verification
- `page.tsx` is now `force-dynamic`. Before, the API-key check ran at build time, so a production build would never enable Claude drivers.
- `PhoneMap`: the first map fit no longer animates. This fixes a Leaflet `_leaflet_pos` error caused by StrictMode removing the map mid-zoom.

## Real vs mocked
Nothing is mocked. The 200 and 502 paths of the driver-decision route have not been run, because they need `ANTHROPIC_API_KEY` in `.env.local`.

## Open follow-ups
- `font-poppins` resolves to the literal family 'Poppins', which doesn't match the next/font family. Headings get Poppins through h1–h6.
- `cn()` (tailwind-merge) drops `text-fluid-*` when a text colour is also present. The fix is `extendTailwindMerge` in `src/lib/utils.ts`.
- `leaflet.css` isn't in a CSS layer, so it beats Tailwind layers on `.leaflet-*` elements.
- There are no light divider or link tokens, and `fg-error` has low contrast on dark panels.
- `/api/driver-decision` has no rate limiting.
- There is no favicon.

## Checks
`tsc --noEmit`, `eslint src`, `prettier --check src` and `yarn build` pass. In the browser, a full ride ran at 40× from pickup to done with no console errors: two maps, 30 drivers and a single simulation loop.
