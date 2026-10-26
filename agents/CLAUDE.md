# CLAUDE.md — Sidekick SeeThrough

## Project Overview

Franchise research and comparison web app. Users browse franchise brands, read/write reviews, compare opportunities, and access educational documentation. Part of the Franchise Sidekick ecosystem.

## Stack

- **Framework**: Next.js 15 (App Router, Turbopack in dev), React 19, TypeScript
- **Styling**: Tailwind CSS 4, Radix UI primitives, CVA variants, Lucide icons
- **Forms**: React Hook Form + Zod
- **Auth**: NextAuth 4 (frontend session) + Rails backend (source of truth)
- **HTTP**: Axios via `AxiosAuthGuard` provider
- **Monitoring**: Sentry
- **Package manager**: Yarn only — never use `npm`

## Running the App

```bash
yarn dev       # http://localhost:4000
yarn build     # production build
yarn lint      # ESLint
yarn format    # Prettier
yarn pr        # build + format (pre-merge check)
```

## Component Structure

Follow this hierarchy — do not create new top-level folders:

```
src/components/
  ui/             # Raw ShadCN-style primitives (button, card, dialog, etc.)
  atoms/          # Small, reusable presentational pieces with minimal logic
  modules/        # Larger general-purpose components (NavBar, Auth flows, etc.)
  brands/         # Components specific to brand pages
  reviews/        # Components specific to reviews pages
  franchise-brands/
  profile/
  documentation/
  home/
  providers/      # Context/Provider components — do not put UI here
```

**Rules:**

- If a component is only used on one specific page/feature → put it in that feature folder (`brands/`, `reviews/`, etc.)
- If it is small and general-purpose → `atoms/`
- If it is larger and general-purpose (has meaningful logic or composition) → `modules/`
- If it is a raw primitive without feature logic → `ui/`
- These `ui/` files contain shadcn ui components, do not modify these unless you directly instructed to and understand the implications
- Prefer composition over building large monolithic components

## Data Fetching

**Default to server components and server actions.** Add `"use client"` only when the component genuinely requires browser interactivity (state, effects, event handlers).

- Server fetching uses `commandCenter.X.method(ApiStyle.SERVER, ...)`
- Client fetching goes through internal `/api/...` routes using `commandCenter.X.method(ApiStyle.CLIENT, ...)`
- Server actions live in `src/app/actions/`
- Never fetch directly from the Rails backend in client code — always proxy through Next.js internal routes

## Authentication Architecture

**The browser knows the user, but the server knows the backend token.**

The Rails bearer token lives in the encrypted NextAuth JWT cookie — it is never exposed to client JavaScript or `session.user`.

### What client components can use

```ts
session.user.id;
session.user.email;
session.user.firstName;
session.user.lastName;
session.user.meta;
```

### What stays server-only

- `railsBearerToken` extraction → `src/lib/commandCenter/core/auth/getServerBearerToken.ts`
- Server-side requests → `src/lib/commandCenter/core/server/serverComponentRequest.ts`
- Client-proxied requests → `src/lib/commandCenter/core/client/requests.ts`

### Auth flow summary

1. Client needs authenticated data → calls internal `/api/...` route
2. Route handler reads encrypted NextAuth cookie → extracts `railsBearerToken`
3. Route handler forwards request to Rails with `Authorization: Bearer ...`
4. Browser never touches the backend token

### Key auth files

- `src/app/api/auth/[...nextauth]/authOptions.ts` — NextAuth config, JWT/session callbacks
- `src/lib/commandCenter/core/auth/getServerBearerToken.ts` — server-side token extraction
- `src/components/providers/ServerSessionSync.tsx` — keeps frontend session in sync with Rails
- `src/components/providers/AxiosAuthGuard.tsx` — signs out on 401 from any client request
- `middleware.ts` — first-pass route protection (cookie presence only, not Rails truth)

### Page-Level Session Sync

- Every new page-level component must have `<ServerSessionSync />` defined as the first thing in the JSX.

### Service call convention

```ts
// Correct — api style first, optional token last
commandCenter.UserBrands.getUserBrand(ApiStyle.CLIENT, userId, params);

// Avoid — old pattern with token as first arg
commandCenter.UserBrands.getUserBrand(
  userToken,
  ApiStyle.CLIENT,
  userId,
  params
);
```

## Styling

**See [`agents/STYLING.md`](./STYLING.md) for the full styling guide — read it before any styling task.**

Key points:

- Use conditional JSX rendering via `If` from `@/lib/If` (default export) instead of inline `&&` / ternary expressions in JSX, e.g. `<If condition={...}><Foo /></If>` or `<If condition={...} then={<Foo />} else={<Bar />} />`
- Use `cn()` from `src/lib/utils.ts` to merge Tailwind classes
- Prefer semantic color tokens (`fg-*`, `surface-*`, `stroke-*`) and fluid typography (`text-fluid-*`) over raw scales and arbitrary `[px]` values
- Do not write inline `style={{}}` — use Tailwind classes (including arbitrary properties for gradients)
- Reuse/extend existing `atoms/` components and primitives — do not introduce one-off design tokens; if a value has no token, stop and ask
- `ui/` is vendored shadcn — do not edit those files; this app's variants live in `atoms/`
- Dark mode is **not** used — do not add `dark:` variants
- Prettier config: single quotes, no trailing commas, 80-char print width, 2-space indent

## TypeScript

- Strict mode is on — avoid `any`; the ESLint rule that allows it exists only for edge cases
- All new types go in `src/types/` or colocated with the feature
- Use Zod for runtime validation at API/form boundaries
- Always explicitly type `useState` — e.g. `useState<boolean>(false)`, not `useState(false)`

## Key Utilities

```ts
import { cn } from '@/lib/utils'; // Tailwind class merging
import { If } from '@/lib/If'; // Conditional rendering
import { formatTextFieldPhoneNumber } from '@/lib/utils';
import { defaultCurrency } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTailwindBreakpoint } from '@/hooks/useTailwindBreakpoint';
```

Path alias: `@/` maps to `src/`

**Always import via `@/`** (`@/components/...`, `@/lib/...`) — never relative
`./` or `../` imports, even for sibling files in the same folder.

## Constraints

**No unnecessary abstractions.** This is the most important rule.

- Do not create helper functions, utilities, or shared components unless the same logic is genuinely used in 3+ places
- Do not extract a one-liner into a named function "for readability"
- Do not create a new file when the logic belongs inline in the component
- Do not add a new package when the existing stack can solve the problem
- Make the smallest change that fits the existing architecture

**Security:**

- Never put secrets in `NEXT_PUBLIC_` variables unless intentionally public
- Never expose `railsBearerToken` in `session.user` or client code
- Never commit `.env.local` or private `age` keys

**Dependencies:**

- Use `yarn`, never `npm`
- Only `yarn.lock` is permitted. Never commit `package-lock.json`
- Do not add packages when built-in Next.js, React, Tailwind, Radix, or existing utilities already solve it

## Environment

- Local dev: `.env.local` (decrypt from `.env.shared` via `sops -d .env.shared > .env.local`)
- Production: Heroku config vars only — `IS_PRODUCTION=true` on prod, `false` on non-prod
- `SOPS_AGE_KEY_FILE` must point to `~/.config/sops/age/keys.txt`

## Code Audit Guidelines

When asked to audit code changes:

- Remove all unnecessary inline `style={{}}` attributes (which are sometimes temporarily used for debugging CSS issues).
- Remove all newly added `console.log` statements.
- List all affected pages/features for manual testing.
- Instruct the developer to run `yarn pr` to verify the build, formatting, and linting.
