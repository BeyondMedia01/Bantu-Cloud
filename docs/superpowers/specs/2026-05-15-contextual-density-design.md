# Contextual Density System — Design Spec

**Date:** 2026-05-15
**Status:** Approved for implementation planning

---

## Problem

Every page in the application uses the same spatial rhythm: `p-4`/`p-6` cards, `gap-3`/`gap-4` grids, `text-base` body copy. A payroll run showing $124k in multi-currency breakdowns uses the same visual weight as a leave request form. The UI communicates no hierarchy of stakes.

The fix is not to change the visual identity. Rounded corners, pill buttons, Inter, and the lime-green brand color stay. What changes is **density** — the spatial compression and typographic weight applied to each surface based on what the user is doing there.

---

## Design

### Three Tiers

Density maps to **user intent**, not role. The same person running payroll (Dense) and approving leave (Standard) should feel the difference, because the tasks are different.

| Tier | Intent | Token alias | Examples |
|------|--------|-------------|----------|
| Dense | Scan, compare, enter bulk data | `compact` | Payroll runs, payroll history, tax tables, NSSA/ZIMRA returns, bulk import, audit logs |
| Standard | Configure, review, approve | `standard` | Reports, Settings, Leave Admin, Expenses Admin, Employee Edit, Company Setup |
| Spacious | Request or view personal information | `relaxed` | Employee dashboard, payslip view, leave request, profile, onboarding |

Standard is the default. A page without an explicit density declaration falls back to Standard.

---

### Token Architecture

Define `--space-unit: 1rem` at `:root`. Each tier scales it by a fixed ratio. Do not specify absolute values directly; change the ratio or the base unit to shift a tier globally.

```css
:root {
  --space-unit: 1rem;

  /* Spatial tokens — Standard tier (default) */
  --card-padding: var(--space-unit);
  --grid-gap: calc(var(--space-unit) * 0.75);
  --section-gap: calc(var(--space-unit) * 1.5);

  /* Typography tokens — Standard tier (default) */
  --text-body: 0.875rem;
  --leading-body: 1.5;
}

/* PageContent omits data-density entirely when density="standard",
   so Standard pages inherit :root values without a redundant selector. */

[data-density="compact"] {
  --card-padding: calc(var(--space-unit) * 0.75);
  --grid-gap: calc(var(--space-unit) * 0.5);
  --section-gap: var(--space-unit);
  --text-body: 0.8125rem;
  --leading-body: 1.4;
}

[data-density="relaxed"] {
  --card-padding: calc(var(--space-unit) * 1.4);
  --grid-gap: var(--space-unit); /* 1rem — 33% jump from Standard's 0.75rem vs. 25% drop to Compact; tune in Step 1 if the gap feels too large */
  --section-gap: calc(var(--space-unit) * 2);
  --text-body: 1rem;
  --leading-body: 1.6;
}
```

The full spatial token set across tiers:

| Token | Compact | Standard | Relaxed | Purpose |
|-------|---------|----------|---------|---------|
| `--card-padding` | `0.75rem` | `1rem` | `1.4rem` | Padding inside cards |
| `--grid-gap` | `0.5rem` | `0.75rem` | `1rem` | Gaps within column grids |
| `--section-gap` | `1rem` | `1.5rem` | `2rem` | Vertical gap between independent sections |

`--section-gap` applies to the `flex-col gap-*` or `space-y-*` that stacks cards on a page. Without it, compact card interiors sit inside a full-width page rhythm and the density signal is lost.

**Typography does not follow the spatial ratio.** Type sizing has different ergonomic constraints; forcing it into the ratio produces wrong results. Specify it as discrete values:

| Token | Compact | Standard | Relaxed |
|-------|---------|----------|---------|
| `--text-body` | `0.8125rem` | `0.875rem` | `1rem` |
| `--leading-body` | `1.4` | `1.5` | `1.6` |

**Page headings are not tokenized.** Page titles use `text-2xl` (1.5rem) across all tiers. On a Dense page this produces a 1.85× heading-to-body ratio; on a Relaxed page, 1.5×. This is intentional: a larger relative heading on data-heavy pages helps users orient quickly before scanning the table or grid below. Evaluate heading proportions during Step 1 on the test page. If the ratio feels off at compact density, add heading tokens before proceeding to Step 2.

> Do not tune type tokens independently. If the values feel wrong, revisit the discrete values together — not one in isolation.

---

### Mechanism

A `PageContent` component (conceptual name, created in Step 4) accepts a `density` prop. It writes the corresponding `data-density` attribute to its root element. Every component below inherits the active token values through the CSS cascade — no prop drilling, no React context.

`PageContent` in this spec is a conceptual term, not an existing component. There are two layout components in the codebase that are easy to confuse:

- `frontend/src/components/AppShell.tsx` — the sidebar + topbar wrapper. **Do not put `data-density` here.** The sidebar is not a page surface; wiring density to AppShell would apply it to the nav, which is wrong.
- `frontend/src/components/page-shell.tsx` — an existing but currently unused component for page title/back-button/actions.

The `data-density` attribute belongs on the **main content wrapper** inside `AppShell` — the `<div className="... max-w-[1400px] mx-auto">` (search for `max-w-\[1400px\]` to locate it). Step 4 extracts this div into a new `PageContent` component that accepts a `density` prop. Pages import and wrap their content in `PageContent density="compact"` rather than passing density through `AppShell`. This keeps AppShell free of page-level concerns and gives pages direct ownership of their density. The sidebar and topbar are unaffected.

```tsx
<PageContent density="compact">
  {/* All SectionCard, grid, and layout components below
      inherit --card-padding and --grid-gap automatically */}
</PageContent>
```

A missing `density` prop degrades gracefully to Standard (the `:root` default). After migration, a `SectionCard` that previously had `className="p-4"` becomes:

```tsx
// Before
<div className="rounded-2xl p-4 gap-3">

// After
<div className="rounded-2xl p-[var(--card-padding)] gap-[var(--grid-gap)]">
```

The rounding stays; the spacing responds to the density cascade.

On the page wrapper that stacks independent sections:

```tsx
// Before
<div className="flex flex-col gap-6">

// After
<div className="flex flex-col gap-[var(--section-gap)]">
```

**Tailwind note:** consuming custom properties requires arbitrary value syntax: `p-[var(--card-padding)]`, `gap-[var(--grid-gap)]`. This form and `p-4` carry identical specificity — whichever appears last in the stylesheet wins. A downstream component that adds a hardcoded `p-4` silently overrides the cascade for its own subtree. The cleanup pass (Step 6) must remove all hardcoded spatial utilities from shared components. A lint rule enforcing no hardcoded spacing on shared component files is strongly recommended after Step 2. If the team chooses not to build one, enforce the constraint through code review until Step 6 is complete, then drop the requirement.

---

### Tables

Tables are always compact, regardless of the parent page tier. A Standard page displaying a document history table must not render that table at Standard spacing — tables are scan surfaces, and scan surfaces need density.

**No shared `DataTable` component exists.** Every page in the app uses raw `<table>` elements — `Payroll.tsx`, `Leave.tsx`, `Loans.tsx`, `Expenses.tsx`, and others. Step 3 therefore requires creating a `DataTable` component before any density enforcement is possible. This is the highest-risk step in the migration: it is a structural change to every table-bearing page, not a token swap.

Once created, `DataTable` enforces compact density by setting `data-density="compact"` on its own root element, overriding the parent cascade locally. Cell and row components inside `DataTable` then use `p-[var(--card-padding)]` — which resolves to compact values because they sit inside the `data-density="compact"` subtree. Any table rendered through `DataTable` gets compact density for free, regardless of the page tier.

---

### Semantic Color

Semantic color is a separate concern from density but ships in the same pass. Dense pages — payroll runs, tax tables, statutory returns — are where high-stakes data appears; defining color semantics without density produces half the benefit.

The brand green (`oklch(0.82 0.18 133)`) appears only on primary call-to-action buttons and success states. It never appears on data values or totals.

| Intent | Token | Notes |
|--------|-------|-------|
| Primary action, success | `--color-brand` (lime green) | Buttons and confirmed states only |
| Attention, threshold warnings | `--color-warning` (amber) | Underpayments, proximity to limits |
| Errors, critical alerts, failed deductions | `--color-critical` (red) | Tax due, deduction failures |
| All data display | `--foreground` / `--muted-foreground` | Numbers, labels, table cells |

Define these tokens in `index.css` alongside the density tokens:

```css
:root {
  /* Semantic color tokens */
  --color-brand: oklch(0.82 0.18 133);   /* lime green — actions and success only */
  --color-warning: oklch(0.79 0.17 75);  /* amber */
  --color-critical: oklch(0.63 0.24 25); /* red — data display only (tax due, deduction failures); distinct from --destructive (oklch 0.577 0.245 27.325) which stays for button variants (delete, reject actions) */
  /* --foreground and --muted-foreground already defined by shadcn theme */
}
```

**Status badges keep their current semantic colors.** Badges communicate state (APPROVED, PENDING, REJECTED), not data. A green APPROVED badge and a red REJECTED badge are correct uses of color — they convey meaning the user relies on. The rule "brand green for actions and success only" does not override badge semantics; it prevents the brand green from appearing on raw numbers, totals, and data labels. Badges across Leave, Loans, and Expenses retain their current `bg-emerald-50 text-emerald-700` and equivalent styling. Do not migrate badges to `--muted-foreground`.

Migration follows the same shared-component-first order: update data display components to use `--foreground` before updating individual pages.

---

## Migration Sequence

Seventy-one pages require updating. The sequence below minimizes risk by proving the mechanism before touching pages.

**Step 1 — Prove the cascade (one component)**
Replace hardcoded Tailwind utilities on `SectionCard` with custom property consumers (`p-[var(--card-padding)]`, `gap-[var(--grid-gap)]`). Define the tokens in `index.css`. Add `data-density="compact"` to a single test page. Verify spacing changes. This is the real proof of concept.

**Step 2 — Migrate shared components and define color tokens**
Extend the custom property pattern to all shared layout primitives: grid wrappers, `PageHeader`, any other component used across multiple pages. These are the multipliers — one change propagates everywhere. In the same step, define the semantic color tokens in `index.css` (see Semantic Color section) and update shared data display components — stat values, totals, table cells — to use `--foreground` / `--muted-foreground` instead of any hardcoded color utilities. Do not update individual pages yet; shared component changes propagate the color semantics automatically.

**Step 3 — Create DataTable and migrate raw tables**
No shared table component exists. Create a `DataTable` component that sets `data-density="compact"` on its root and uses `p-[var(--card-padding)]` on cells and rows. Then migrate every raw `<table>` in the app — `Payroll.tsx`, `Leave.tsx`, `Loans.tsx`, `Expenses.tsx`, and others — to use `DataTable`. This is the largest single step and should be scoped carefully: audit all raw table instances before starting, and migrate one page end-to-end before touching the rest.

**Step 4 — Create PageContent and wire density**
Extract the main content div (search `max-w-\[1400px\]` in `AppShell.tsx` to locate it) into a `PageContent` component that accepts a `density` prop and writes the corresponding `data-density` attribute. Pages wrap their content in `<PageContent density="compact">`. The cascade activates for any page that uses it; pages without `PageContent` degrade to Standard via `:root` defaults.

**Wizard and multi-step pages:** some pages (e.g. `BackPay.tsx`) change user intent between steps — data entry (Dense) then review (Standard). `PageContent` sets a single density for the whole page. Do not switch density between wizard steps; the layout shift creates more cognitive friction than the density mismatch. Assign the most data-dense step's tier to the whole page.

**Step 5 — Classify and tag pages**
Wrap each page's content in `<PageContent density="...">` with the appropriate tier. Roll out Standard pages first — they require the least visual change (Standard is the `:root` default) and have the largest surface area, which builds team familiarity with the pattern before touching extremes. Dense pages second — they share structural similarity with Standard pages, so the pattern is fresh in mind. Relaxed pages last — these are employee-facing personal-data surfaces where visual regression is most visible to end users and warrants the most careful review.

**Step 6 — Cleanup pass**
Hunt remaining hardcoded Tailwind utilities on one-off page components that bypassed shared components. Replace with custom property consumers. In the same pass, audit page-level color usage — any hardcoded color on a data value, total, or alert that was not caught by the shared component migration in Step 2. Apply `--color-warning` and `--color-critical` to high-stakes data labels (tax due, underpayment alerts, deduction failures) that are defined inline on individual pages rather than in shared components.

> Steps 1–4 are sequential: each depends on the previous. Within Step 5, Standard/Dense/Relaxed page groups can be assigned in parallel across team members, but each group's changes depend on Step 4 completing first.

---

## What Changes

Card padding, grid gaps, section gaps, body text size, line height, and the application scope of the brand green. Everything else stays.

## What Does Not Change

- `rounded-2xl` on cards
- Pill-shaped (`rounded-full`) primary buttons
- Inter typeface
- OKLCH color palette
- Glass morphism effects
- Status badge colors (semantic state, not data display)
- The brand green itself — only its application scope narrows
