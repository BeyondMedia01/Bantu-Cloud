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
Geist Variable becomes the sole font. Remove the `Inter` declaration from `:root`. Geist Variable is already imported via `@fontsource-variable/geist` and declared in `@theme inline`.

**Color tokens**
Introduce one new explicit brand token:

```css
--color-brand: #b2db64; /* primary CTA green */
```

Retire `--color-btn-primary` as an alias. All primary buttons reference `--color-brand`.

Keep `--color-navy` as the heading color alias. Do not remap it — pages use it via `text-navy` and it must remain stable.

The shadcn oklch semantic vars (`--primary`, `--foreground`, `--card`, etc.) remain untouched. The `--color-primary` custom property intentionally shadows `--primary` to serve as the white card background — preserve this.

**Dark mode**
Audit and complete the `.dark {}` block. Specifically: `--chart-1` through `--chart-5` are currently identical in both modes. Assign distinct dark-mode values so charts remain readable on dark backgrounds.

**Spacing scale**
No new CSS. Document the canonical spacing values so developers stop reaching for arbitrary sizes:

| Token | Value | Use |
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

Props: `title: string`, `subtitle?: string`, `onBack?: () => void`, `children: ReactNode`

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

Props: `tabs: { id: string; label: string; hasError?: boolean }[]`, `active: string`, `onChange: (id: string) => void`

#### `<StatCard>`

Renders a single dashboard metric.

```tsx
<StatCard label="Total Employees" value={142} trend="+3 this month" icon={Users} />
```

Props: `label: string`, `value: string | number`, `trend?: string`, `icon?: LucideIcon`

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

Props: `variant: 'no-data' | 'no-results' | 'error'`, `icon: LucideIcon`, `title: string`, `description: string`, `action?: { label: string; onClick: () => void }`

Icon renders at `size={40}` with `text-slate-300`. Title uses `text-sm font-semibold text-navy`. Description uses `text-sm text-slate-500`.

#### `<LoadingSkeleton>`

Three variants for loading states. Never use a spinner for full-page loads.

```tsx
<LoadingSkeleton variant="table" />
<LoadingSkeleton variant="card" />
<LoadingSkeleton variant="form" />
```

- `card` — mimics a SectionCard with skeleton lines
- `table` — shows 5 skeleton rows with column widths matching a standard table
- `form` — shows skeleton label + input pairs

Props: `variant: 'card' | 'table' | 'form'`

#### `<ErrorBoundary>`

Catches unexpected React render errors. Renders the page-level destructive Alert by default.

```tsx
<ErrorBoundary>
  {/* any subtree */}
</ErrorBoundary>
```

Props: `children: ReactNode`, `fallback?: ReactNode`

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

**Page level:** `<Alert variant="destructive">` with `AlertCircle` icon. Surfaced by React Query `onError` or caught by `<ErrorBoundary>`. Never substitute `console.error` for visible UI feedback.

---

## File Deliverables

| File | Change |
|---|---|
| `frontend/src/index.css` | Consolidate font, add `--color-brand`, complete dark mode chart tokens |
| `frontend/src/components/ui/page-shell.tsx` | New |
| `frontend/src/components/ui/section-card.tsx` | New |
| `frontend/src/components/ui/tab-bar.tsx` | New |
| `frontend/src/components/ui/stat-card.tsx` | New |
| `frontend/src/components/ui/empty-state.tsx` | New |
| `frontend/src/components/ui/loading-skeleton.tsx` | New |
| `frontend/src/components/ui/error-boundary.tsx` | New |
| `frontend/src/Design.md` | Replace with reference to this spec |

---

## What This Does Not Cover

- Migration of existing pages to use the new primitives (separate incremental work)
- Storybook or any visual workbench tooling
- New brand decisions (colors, radius, font) — this system codifies what exists
