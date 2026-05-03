# Bantu Design System

**Date:** 2026-05-03
**Status:** Approved

---

## Purpose

This document defines the Bantu design system — a three-layer system that enforces visual consistency, provides a canonical reference for developers and AI agents, and establishes the foundation for all new feature work.

The system addresses six known gaps: inconsistent color usage, inconsistent typography, ad-hoc spacing, component reimplementation drift, missing UI patterns (empty states, loading, error boundaries), and incomplete dark mode coverage.

---

## Approach: Three Layers

The system ships in three independent layers. Each layer is useful on its own; they compound.

1. **Token Layer** — the CSS foundation: colors, typography, spacing, radius
2. **Primitive Layer** — structural React components that encode canonical layout patterns
3. **Pattern Layer** — documented and implemented patterns for data tables, empty states, loading, modals, and error handling

---

## Layer 1: Token Layer

### Problem

`index.css` contains two parallel token systems:

- A legacy set: `--color-navy`, `--color-btn-primary`, `--color-border`, etc.
- shadcn's semantic oklch vars: `--primary`, `--foreground`, `--border`, etc.

Components pull from both inconsistently. Dark mode is defined for the legacy vars but incomplete for the shadcn vars. The font declaration is split: `Inter` in `:root`, `Geist Variable` in `@theme inline`.

### Changes

**Font**
Inter remains the canonical font — do not change the `font-family` declaration in `:root`. The `@theme inline` block declares `Geist Variable` via `--font-sans`; this is a shadcn default that must stay in place for shadcn components, but the `:root` `font-family: Inter` declaration overrides it for the app shell. No font changes are required.

**Color tokens**
Introduce one new explicit brand token:

```css
--color-brand: #b2db64; /* primary CTA green */
```

Retire `--color-btn-primary` as an alias. All primary buttons reference `--color-brand`. Migration order:
1. Add `--color-brand: #b2db64` to `index.css`.
2. Run `grep -r "btn-primary\|color-btn-primary" frontend/src` to find all usages.
3. Replace Tailwind class usages (`bg-btn-primary`) with `bg-brand`. Replace CSS `var(--color-btn-primary)` usages with `var(--color-brand)`.
4. Remove `--color-btn-primary` from `index.css` only after all usages are replaced.

Keep `--color-navy` as the heading color alias. Do not remap it — pages use it via `text-navy` and it must remain stable.

The shadcn oklch semantic vars (`--primary`, `--foreground`, `--card`, etc.) remain untouched. `--color-primary` already exists in `index.css` (set to `#FFFFFF` in `:root` and `#1E293B` in `.dark {}`). It intentionally shadows `--primary` to serve as the white card background in light mode (`#FFFFFF`). In dark mode it resolves to `#1E293B` (already set in `.dark {}`). Both values must be preserved. Components that rely on this are: any element using `bg-primary` as a card/section background (not as a button color). If a shadcn upgrade resets `--color-primary`, audit these usages immediately.

**Dark mode**
Audit and complete the `.dark {}` block. Specifically: `--chart-1` through `--chart-5` are currently identical in both modes. Replace them with these dark-mode values in `.dark {}`:

```css
--chart-1: oklch(0.75 0.18 145);   /* muted green — brand-adjacent */
--chart-2: oklch(0.65 0.15 220);   /* muted blue */
--chart-3: oklch(0.60 0.12 30);    /* muted amber */
--chart-4: oklch(0.55 0.14 300);   /* muted purple */
--chart-5: oklch(0.50 0.13 0);     /* muted red */
```

**Spacing scale**
No new CSS. Document the canonical Tailwind utility classes so developers stop reaching for arbitrary sizes. These are not CSS custom properties — they are the approved set of Tailwind spacing utilities:

| Utility class | Pixel value | Use |
|---|---|---|
| `gap-2` | 8px | Tight inline groupings |
| `gap-4` | 16px | Standard between fields |
| `gap-6` | 24px | Between form sections |
| `gap-8` | 32px | Between page sections |
| `p-4` | 16px | Card inner padding (small) |
| `p-6` | 24px | Card inner padding (standard) |

**Radius**
`--radius: 0.625rem` — do not change.

---

## Layer 2: Primitive Layer

### Problem

Pages reimplement the same structural patterns by hand. Every reimplementation drifts. A page header with a back button appears in at least a dozen files with subtle differences in spacing, font weight, and markup structure.

### Components

All components live in `frontend/src/components/ui/`. Each accepts a `className` prop for overrides. All use existing shadcn primitives internally — no new styling decisions.

#### `<PageShell>`

Wraps every main page. Renders the `max-w-3xl` container, back button, title, and subtitle.

```tsx
<PageShell title="Employees" subtitle="Manage your workforce" onBack={() => navigate(-1)}>
  {/* page content */}
</PageShell>
```

Props: `title: string`, `subtitle?: string`, `onBack?: () => void`, `actions?: ReactNode`, `children: ReactNode`, `className?: string`

`actions` renders in the top-right of the header row, aligned with the title. Use it for primary page actions (e.g. "Add Employee" button). If omitted, the header right side is empty.

When `onBack` is omitted, the back button is not rendered — the title block takes the full left position with no gap or placeholder.

#### `<SectionCard>`

Wraps a logical group of fields or data. Renders a shadcn `Card` with the uppercase label header pattern.

```tsx
<SectionCard title="Personal Details">
  {/* fields */}
</SectionCard>
```

Props: `title: string`, `children: ReactNode`, `className?: string`

#### `<TabBar>`

Renders the pill-style tab switcher. Manages no state — fully controlled.

```tsx
<TabBar
  tabs={[{ id: 'details', label: 'Details' }, { id: 'history', label: 'History' }]}
  active="details"
  onChange={setActiveTab}
/>
```

Props: `tabs: { id: string; label: string; hasError?: boolean }[]`, `active: string`, `onChange: (id: string) => void`, `className?: string`

`hasError` renders a red dot after the tab label (`after:content-["•"] after:text-red-400`) to indicate the tab contains a validation error. Used in multi-section forms to flag which tabs have invalid fields.

Accessibility: the tab container renders with `role="tablist"`. Each tab button renders with `role="tab"` and `aria-selected={active === tab.id}`.

#### `<StatCard>`

Renders a single dashboard metric.

```tsx
<StatCard label="Total Employees" value={142} trend="+3 this month" icon={Users} />
```

Props: `label: string`, `value: string | number`, `trend?: string`, `trendDirection?: 'up' | 'down' | 'neutral'`, `icon?: LucideIcon` (import type: `import type { LucideIcon } from 'lucide-react'`)

`trendDirection` controls color: `up` → `text-green-600`, `down` → `text-red-500`, `neutral` (default) → `text-slate-500`. The caller is responsible for passing the correct direction — the component does not parse the `trend` string.

#### `<EmptyState>`

Three variants for empty list scenarios.

```tsx
<EmptyState
  variant="no-data"
  icon={Users}
  title="No employees yet"
  description="Add your first employee to get started."
  action={{ label: 'Add Employee', onClick: () => navigate('/employees/new') }}
/>
```

Props: `variant: 'no-data' | 'no-results' | 'error'`, `icon?: LucideIcon`, `title: string`, `description: string`, `action?: { label: string; onClick: () => void }`

Default icons when `icon` is omitted: `no-data` → `Inbox`, `no-results` → `SearchX`, `error` → `AlertTriangle`.

**Delineation from `<ErrorBoundary>`:**
- Use `<EmptyState variant="error">` when a React Query fetch fails (known, expected error state — the component rendered successfully but data retrieval failed).
- Use `<ErrorBoundary>` for unexpected React render crashes (the component itself threw during render). These are distinct failure modes. The `error` empty state is a UI choice; `<ErrorBoundary>` is a safety net.

Icon renders at `size={40}` with `text-slate-300 dark:text-slate-600`. Title uses `text-sm font-semibold text-navy dark:text-slate-100`. Description uses `text-sm text-slate-500 dark:text-slate-400`.

#### `<LoadingSkeleton>`

Three variants for loading states. Never use a spinner for full-page loads.

```tsx
<LoadingSkeleton variant="table" />
<LoadingSkeleton variant="card" />
<LoadingSkeleton variant="form" />
```

- `card` — mimics a SectionCard with skeleton lines
- `table` — shows skeleton rows (default 5, overridable via `rows` prop). Renders 4 skeleton cells per row at widths `w-1/3`, `w-1/4`, `w-1/4`, `w-1/6` (summing to approximately full width). This matches the most common 4-column list layout (name, status, date, amount). Column layout is fixed — pages with different column counts still use this variant; the skeleton approximates rather than mirrors exact columns.
- `form` — shows skeleton label + input pairs

Props: `variant: 'card' | 'table' | 'form'`, `rows?: number` (table variant only, default 5)

#### `<ErrorBoundary>`

Catches unexpected React render errors. Renders the page-level destructive Alert by default.

```tsx
<ErrorBoundary>
  {/* any subtree */}
</ErrorBoundary>
```

Props: `children: ReactNode`, `fallback?: ReactNode`

Implementation note: React error boundaries require a class component with `static getDerivedStateFromError(error)` (sets `hasError: true` in state) and `componentDidCatch(error, info)` (optional logging). The functional component wrapper pattern is acceptable — export a functional `<ErrorBoundary>` that internally renders a class component. The `fallback` prop replaces the default destructive Alert when provided.

---

## Layer 3: Pattern Layer

### Data Tables

Use shadcn `Table` primitives. Data fetching via React Query. Sort and filter state lives in URL search params — not component state — so links are shareable and browser back works correctly.

Column headers: `text-xs font-bold uppercase tracking-wider text-slate-400`
Row hover: `hover:bg-slate-50 dark:hover:bg-slate-800/50`
Pagination controls: bottom of table, right-aligned

Loading state: `<LoadingSkeleton variant="table" />`
Empty state: `<EmptyState variant="no-results" />` when filters active, `<EmptyState variant="no-data" />` otherwise

### Empty States

Three variants, always using `<EmptyState>`:

| Variant | When | CTA |
|---|---|---|
| `no-data` | Collection exists but has no items | Primary action to create first item |
| `no-results` | Search or filter returned nothing | Clear filters link |
| `error` | Data fetch failed | Retry button |

### Loading States

- **Full page / section load:** `<LoadingSkeleton>` matching the content being loaded
- **In-button loading:** Spinner icon inside the button, button disabled. Use `<Loader2 className="animate-spin" size={16} />`.
- **Never:** full-page spinners, blank white screens, or omitting a loading state entirely

### Modals and Dialogs

Always use shadcn `Dialog` or `AlertDialog`. Never build a modal from raw `div` + `z-index`.

**Destructive confirmation:** Use `AlertDialog` with explicit labelled buttons:
- Cancel button: `variant="outline"`
- Confirm button: `variant="destructive"`, label describes the action ("Delete Employee", not "OK")

**Form modals:** Use the same react-hook-form + zod pattern as page-level forms. No ad-hoc `useState` for field values inside a modal.

### Error Handling

Two levels:

**Field level:** shadcn `FormMessage` — already standard. No change.

**Page level:** `<Alert variant="destructive">` with `AlertCircle` icon. The project uses `@tanstack/react-query` v5. In v5, `onError` callbacks on `useQuery` and `useMutation` were removed. Surface errors by reading the `error` value from the hook's return (`const { data, error } = useQuery(...)`) and conditionally rendering the Alert. For unexpected render errors, `<ErrorBoundary>` catches them at the component tree level. Never substitute `console.error` for visible UI feedback.

---

## File Deliverables

| File | Change |
|---|---|
| `frontend/src/index.css` | Add `--color-brand`, complete dark mode chart tokens, remove `--color-btn-primary` |
| `frontend/src/components/ui/page-shell.tsx` | New |
| `frontend/src/components/ui/section-card.tsx` | New |
| `frontend/src/components/ui/tab-bar.tsx` | New |
| `frontend/src/components/ui/stat-card.tsx` | New |
| `frontend/src/components/ui/empty-state.tsx` | New |
| `frontend/src/components/ui/loading-skeleton.tsx` | New |
| `frontend/src/components/ui/error-boundary.tsx` | New |
| `frontend/src/Design.md` | File already exists. Replace its entire content with a redirect pointing to this spec (path relative to repo root: `/docs/superpowers/specs/2026-05-03-design-system-design.md`) |

---

## What This Does Not Cover

- Migration of existing pages to use the new primitives (separate incremental work)
- Storybook or any visual workbench tooling
- New brand decisions (colors, radius, font) — this system codifies what exists
