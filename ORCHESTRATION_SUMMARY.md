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
- `leaflet.css` isn't in a CSS layer, so it beats Tailwind layers on `.leaflet-*` elements.
- There are no light divider or link tokens, and `fg-error` has low contrast on dark panels.
- `/api/driver-decision` has no rate limiting.
- There is no favicon.

## Checks
`tsc --noEmit`, `eslint src`, `prettier --check src` and `yarn build` pass. In the browser, a full ride ran at 40× from pickup to done with no console errors: two maps, 30 drivers and a single simulation loop.

# Run 2: demand heat map

Idle drivers now head toward rider demand instead of roaming at random. Demand is shown and edited on a finer H3 grid.

## Engine (done directly, outside the skills)
- `src/lib/sim/heat.ts`: `HeatMap` stores demand from 0 to 1 per res-9 cell (4,122 cells in the service area).
  - `randomize()` scatters 8–14 soft hot spots, about half of them on real pickup spots, over a faint background.
  - `paint`, `clear`, `load` and `toJSON` support editing and saving.
  - `onChange(changed | null)` reports which cells changed (`null` means the whole map).
- `World` owns `heat` and gives each driver a `pickRoam` picker:
  - **Candidates:** nearby cells (12 res-9 rings) plus 40 far-off hot cells.
  - **Score:** demand² ÷ (1 + 1.5 × idle cars already in or heading to that res-8 area) ÷ (1 + km / 2.5).
  - **Pick:** weighted random among the top 6, and 15% of roams ignore demand, so cars spread out rather than flock. The tuning values are in `DEMAND` in `config.ts`.
  - **Re-planning:** after any heat change, idle drivers drop their roam and re-plan, staggered over about 3 real seconds.
- `Driver.step` takes the picker, and `Driver.roamCell` records the cell a driver is roaming toward.

## Skills, in order
1. **react-component:**
   - The heat canvas layer is in its own pane (z 350), above the res-8 grid pane (z 300) and below routes and cars.
   - Paint and Erase tools in `MapView`: brush of 1–3 rings with an adjustable strength, a dashed brush outline, and map dragging off while a tool is active.
   - `HeatPanel`: show/hide, Randomize, Clear, Paint, Erase, brush size and strength.
   - The Legend gets a demand gradient.
   - `SimulationProvider` saves the heat map to localStorage (`mini-uber.heat.v1`, 500 ms debounce) and loads it, validated with zod.
2. **styling:**
   - Ramp: yellow-30 → yellow-50 → yellow-60 → orange-70 → orange-90. It skips the mid oranges so on-trip cars stay visible.
   - Opacity is `base + range·√value`, with separate values for light and dark basemaps.
   - The brush outline gets a dark-theme variant.
   - `HeatPanel` was compacted into a 2×2 chip grid using `aria-pressed` active states. It clears the Legend at the 320px minimum map height.

## Checks
- `tsc`, `eslint` and `prettier --check` pass.
- In the browser:
  - **Spread across the map:** hot cells cover about 6% of the area but hold about 40–60% of the cars. Cars still cover 24–28 res-8 areas, with at most 2–3 per area. The share of cars in each sixth of the map tracks that sixth's share of demand.
  - **Painted hot spot:** a single painted hot spot drew cars within 2 km up from 6 to 15 in a few simulated minutes, while the rest stayed spread out.
  - **Tools:** Paint, Erase (size 3) and the tool toggle work, and map dragging comes back afterwards.
  - **Reload:** the saved map comes back.
  - **Full ride:** ran end to end with the heat layer on, with no console errors.

## Follow-ups
- Riders are not generated from demand yet, and there is no surge pricing. Demand is static until the user randomizes or paints.
- A cleared map is saved as empty. The random map from startup is not saved until the user edits it.

# Run 3: control panel

Every user control is now in one drawer that the user can hide. The drawer is built to take more sections later.

## Skills, in order
1. **react-component:**
   - **Settings:** `ControlsProvider` (`useControls()`) holds:
     - panel open (saved to `mini-uber.panel-open.v1`)
     - pause, speed, driver count (these write through to `world`)
     - grid visible, heat visible, basemap, heat brush
   - **Map:** GodMap applies the map settings to `MapView`. `MapView` gained `setGridVisible` and `setBasemap`. The Leaflet layers control was removed, and the zoom control moved to the top-right.
   - **Drawer:** `ControlPanel` sits over the left of the map and closes with the X or Esc. Closing it turns off Paint/Erase. Its sections come from the `CONTROL_SECTIONS` array, one file each in `src/components/modules/controls/`:
     - Simulation: pause, speed, driver slider 5–80
     - Map: dispatch grid, demand heat, basemap
     - Demand: randomize, clear, paint/erase, brush size, strength
   - **Top bar:** now just the title and a Controls toggle. `HeatPanel` was deleted.
2. **styling:**
   - **Shared classes:** in `controls/controlClasses.ts`.
   - **Drawer look:** one text size throughout and 30px controls. The active tool is solid orange. The header stays pinned while the drawer scrolls.
   - **Animation:** `animate-slide-in` when the drawer opens.
   - **Overlap:** a `panel-open:` custom variant (in globals.css) moves the Stepper and Legend clear of the open drawer at `sm` widths and up.

## Adding a control
Add a setting to `ControlsProvider` if it needs one. Then write a section component in `controls/`, or add a row to an existing section. A new section also needs an entry in `CONTROL_SECTIONS`.

## Checks
- `tsc`, `eslint` and `prettier --check` pass.
- Tested in the browser:
  - pause, speed, driver slider
  - grid and heat toggles, basemap including dark
  - randomize, clear, paint, erase
  - Esc and X close, and the open state survives a reload
  - a ride with the Stepper showing
- A fresh load showed no console errors.

## Follow-ups
- The 16rem drawer width is hard-coded in three places (`w-64` plus the Stepper and Legend offsets).
- At phone widths the fixed 390px phone frame makes the page scroll sideways. This was already the case before this run.

# Run 4: pin-drop pickup

The rider can now pick up from anywhere in the service area by dropping a pin on the phone map. At the user's request it is pin drop only: no address search, no geocoding service, no API route, and no clicking on the god map. The engine is unchanged, since `App.selectPickup` already takes any `Place`.

## Skills, in order
1. **react-component:**
   - **New phone screen:** `PhoneScreen.PickupPin`, shown by `PickupPinScreen.tsx`, with a "Choose on map" entry on the pickup screen.
   - **PhoneMap:**
     - `isPinMode` and `onPinCenterChange` props.
     - In pin mode the map grows and a fixed centre pin overlay appears.
     - The center is reported on `moveend`.
     - A ResizeObserver calls `invalidateSize`.
     - `fitAll` is paused while the rider is aiming.
     - All view changes are non-animated, to keep the StrictMode fix.
   - **Confirming:** builds `{ name: 'Dropped pin', area: 'near <nearest LOCATIONS place>' }` and uses the same path as a listed place. Confirm is turned off outside the service area.
   - **`placeLabel()` in `src/lib/utils.ts`:** used for the pickup name in the options and en-route screens and in the dispatch feed.
2. **styling:**
   - **Pin accuracy:** the sheet no longer overlaps the map in pin mode, and the pin's tip and ground dot sit on the map centre. Measured: within 0.7px, down from about 12px.
   - **Pin:** a drop shadow, and it lifts while the map is dragged (CSS only, via `.leaflet-dragging`).
   - **Confirm bar:** a "Pickup" eyebrow, a title and "near X". The out-of-service state is shown in orange.
   - **Entry row:** "Choose on map" is now a separate card.
   - **Options header:** shows the area as muted text.
   - **Zoom:** pin mode opens at zoom 14.

## Fix made during final verification
- Reopening pin mode showed the previous pin's label, because the stored pin position wasn't reset. `PinModeOpened` now resets `pinCenter` to `MAP_CENTER`, where the map opens.

## Checks
- `tsc`, `eslint` and `prettier --check` pass.
- In the browser:
  - A real mouse drag updates the label once the map settles, and the label matches the confirmed pickup.
  - A full ride from a dropped pin (near Oak View Mall) went pickup → options → matching → en route → arrived → trip → completed.
  - Listed places still work.
  - No console errors.

## Token gaps
- There is no light error or warning surface token; the out-of-service box uses `bg-orange-5`.
- There is no light divider token; `border-gray-10` is used, matching the list rows.
