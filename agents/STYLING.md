# Styling Guide for AI Agents

**Read this before writing or editing any styled component.** When you implement
a design mockup, your job is to match it using **this codebase's design system** —
not to reproduce the mockup with hardcoded pixel values. A component that looks
right but is built from magic numbers and raw colors is a defect, not a success.

The rules below are deliberate. Follow them as written.

---

## The system at a glance

- **Tailwind CSS 4**, configured entirely through CSS variables in
  [`src/app/globals.css`](../src/app/globals.css). There is no `tailwind.config.js`.
- **Design tokens** live in `globals.css`: semantic colors (`fg-*`, `surface-*`,
  `stroke-*`), fluid typography (`text-fluid-*`), and fluid/fixed spacing.
- **`cn()`** from [`src/lib/utils.ts`](../src/lib/utils.ts) merges classes
  (clsx + tailwind-merge). Use it for any conditional or composed className.
- **Fonts:** Inter (body/UI) and Poppins (headings/display), loaded via next/font.
- **Primitives:** Radix + shadcn live in `src/components/ui/` (vendored — see below).
  This app's reusable building blocks live in `src/components/atoms/`.
- **Icons:** [`lucide-react`](https://lucide.dev) only.

---

## Core rules

### Colors — semantic tokens first
Reach for semantic tokens that describe **intent**, not raw color scales:
- Text: `text-fg-primary`, `text-fg-secondary`, `text-fg-accent`, `text-fg-error`, `text-fg-alternate`, `text-fg-highlight` (teal-60)
- Backgrounds: `bg-surface-primary`, `bg-surface-secondary`, `bg-surface-tertiary`, `bg-surface-accent`, `bg-surface-alternate`, `bg-surface-highlight` (teal-60)
- Borders: `border-stroke-accent`, `border-stroke-focus`, `border-stroke-secondary`, `border-stroke-highlight` (teal-60)

Only fall back to a raw scale (`teal-60`, `gray-50`, `orange-50`, …) when **no
semantic token expresses the intent** — e.g. a specific decorative brand-teal
panel. Prefer the semantic token every time one fits.

### Typography & sizing — prefer fluid, then fixed tokens, then arbitrary
Work down this priority order; only drop to the next tier when the one above
genuinely can't express what you need:

1. **Fluid tokens first.** Typography: `text-fluid-*` (`text-fluid-xs` →
   `text-fluid-5xl`; roughly `text-fluid-5xl`≈h1 … `text-fluid-m`≈body,
   `text-fluid-s`/`text-fluid-xs` for small/caption). Spacing: `p-fluid-m`,
   `px-fluid-s`, `gap-fluid-2xs`, etc. These scale responsively and are the default.
2. **Fixed tokens next.** When you need a fixed (non-scaling) value, use the fixed
   token scale rather than a raw pixel: spacing → `spacing-fixed-*`
   (`p-fixed-xl`, `py-fixed-s`, …, the 10px–52px scale); body text →
   `text-body-fixed`. Reach for these when precise, non-fluid layout control matters.
3. **Arbitrary `[px]` last.** Only when no fluid or fixed token is reasonably close
   (e.g. `text-[15px]`), and flag it with a short comment (see below).

### Arbitrary values — tokens first, brackets as last resort
Snap to the nearest token before reaching for an arbitrary `[px]` value. Only use
an arbitrary value when **no token is reasonably close**, and when you do, leave a
short comment flagging it so it's visible in review:

```tsx
// no token near 52px header inset; arbitrary by design
className="pt-[52px]"
```

### No inline `style={{}}`
Never write inline styles. Use Tailwind utilities — including **arbitrary
properties** for things like gradients:

```tsx
// ❌  style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #fff 0%, transparent 50%)' }}
// ✅
className="bg-[radial-gradient(circle_at_80%_20%,#fff_0%,transparent_50%)]"
```

**Exception — runtime-computed values only:** inline `style` is permitted for
values that genuinely cannot be expressed as a static class, e.g. a progress bar
width driven by JS state (`style={{ width: \`${pct}%\` }}`) or a vendor hack
(`WebkitOverflowScrolling: 'touch'`). Everything static — including all
gradients — must be Tailwind.

### Fonts
- **Poppins** (`font-poppins`) for headings and prominent display text.
- **Inter** (`font-inter`) for body, labels, and UI text — this is the default.

Apply these automatically; don't wait to be told.

### Responsive
Prefer **one adaptive layout** that responds via Tailwind breakpoints. Only build
separate mobile/desktop trees (`md:hidden` / `hidden md:flex`) when the mockups are
**structurally different** — not just to nudge spacing. Custom breakpoint `xs` =
550px is available alongside Tailwind defaults.

### Dark mode — skip it
This app does not use dark mode. **Do not add `dark:` variants.** If you see stray
`dark:*` classes in code you're touching, remove them.

### Icons
Use **`lucide-react`** for all icons. Inline a custom SVG only for a truly custom
graphic that lucide doesn't offer.

### Conditional rendering — use `If`
Use [`@/lib/If`](../src/lib/If.tsx) instead of `&&` / ternary to show or swap a
JSX element:

```tsx
// ❌ {isOpen && <Panel />}
// ✅ <If condition={isOpen}><Panel /></If>
```

Plain value ternaries (text, class names, numbers) are fine as-is — this is only
for element-level show/hide. For 3+ branches rendering different subtrees, use
early returns instead of nesting.

---

## Components & reuse

1. **Reuse or extend before you create.** Check `src/components/atoms/` and
   `src/components/ui/` first. If an existing component is close, extend it (add a
   variant/size) rather than building a new one or hand-rolling JSX.
2. **`ui/` is vendored shadcn — do not edit those files.** Build on top of them, or
   extend the `atoms/` components, which own this app's custom variants and classes
   (see [`atoms/Button.tsx`](../src/components/atoms/Button.tsx)).
3. **Use existing primitives.** Don't hand-roll a `<button>`, checkbox, dialog,
   etc. when a `ui/` (Radix/shadcn) or `atoms/` equivalent exists. Add a variant if
   the mockup needs a new look. Hand-roll only when the design genuinely can't be a
   variant.
4. **Match the target file's variant style.** When extending an `atoms/` component,
   follow whatever pattern that file already uses (string-joined class groups, CVA,
   or `cn()` conditionals). Don't introduce a competing pattern.

---

## When a token doesn't exist

If a mockup clearly needs a value with **no matching token** (a new color, an
unusual radius, a missing type step): **stop and ask.** Don't silently invent a new
token in `globals.css`, and don't quietly bury a one-off arbitrary value. Surface
the gap and let the user decide whether to add a token or accept a one-off.

---

## A few examples

```tsx
// ❌ raw scale + arbitrary font size
className="text-[13px] text-gray-50"
// ✅ semantic token + fluid type
className="text-fluid-s text-fg-secondary"

// ❌ inline style for a gradient
style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #fff 0%, transparent 50%)' }}
// ✅ Tailwind arbitrary property
className="bg-[radial-gradient(circle_at_80%_20%,#fff_0%,transparent_50%)]"

// ❌ hand-rolled button duplicating an existing primitive
<button className="w-full min-h-[56px] rounded-full bg-teal-60 text-white …">
// ✅ use / extend the atom
<Button variant="orange" size="lg">Get started</Button>

// ❌ dark-mode class in a light-only app
className="bg-white dark:bg-surface-primary"
// ✅ omit it
className="bg-surface-primary"
```

---

## Before you finish — self-review

Audit your own diff against this checklist before handing work back:

- [ ] Semantic color tokens used (`fg-*` / `surface-*` / `stroke-*`), raw scales only where no semantic token fit?
- [ ] No unjustified arbitrary `[px]` values — and any that remain carry a flag comment?
- [ ] No inline `style={{}}` anywhere?
- [ ] Sizing follows the priority order — fluid tokens first, fixed tokens (`spacing-fixed-*` / `text-body-fixed`) next, arbitrary `[px]` only as a flagged last resort?
- [ ] Reused or extended an existing `atoms/` component / primitive instead of hand-rolling? (`ui/` untouched.)
- [ ] No `dark:` variants?
- [ ] Poppins for headings, Inter for body?
- [ ] Flagged any genuine token gaps to the user instead of inventing?
- [ ] No `&&` / ternary conditionally rendering a JSX element — used `If` instead?
