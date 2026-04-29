# Material Design 3 Migration — Design Spec

**Date:** 2026-04-29  
**Status:** Approved  
**Scope:** Full replacement of shadcn/ui + Tailwind CSS with MUI v6 + MD3 experimental theme

---

## 1. Goal

Replace the current shadcn/ui + Tailwind design system with Material Design 3 (MD3) using MUI v6's `Experimental_CssVarsProvider`. The migration covers all 65 pages, the AppShell, and all shared components in a single big-bang branch.

---

## 2. Colour System

MUI's `extendTheme` generates full tonal palettes from seed colours. No manual tonal hex values are needed.

| MD3 Role | Seed | Value |
|---|---|---|
| `primary` | Yellow-green CTA | `#B2DB64` |
| `secondary` | Auto-derived tonal accent of primary | auto |
| `tertiary` | Accent Blue | `#3B82F6` |
| `error` | MD3 default | `#B3261E` |

**Neutral seed override:** The MD3 `neutral` role drives surfaces, outlines, and backgrounds in both light and dark schemes. Using navy (`#0F172A`) as the neutral seed would produce near-black surfaces in light mode. Instead, neutral is left at the MUI default (cool grey), and navy is applied directly as the `background.default` and `background.paper` override in the dark mode palette only. Light mode surfaces remain white/near-white as expected.

**Custom semantic tokens** (outside MD3 roles, in `src/theme/tokens.ts`):
- Status positive: `#10B981` (Emerald — active, paid, approved badges)
- Chart palette: 5-stop greyscale from existing `--chart-*` variables — passed as explicit props to `recharts` components from `src/theme/tokens.ts`, since recharts does not inherit MUI CSS variables automatically

**Dark mode:** `Experimental_CssVarsProvider` manages CSS variables and generates both light and dark palettes from the same seeds. `next-themes` owns the `data-color-scheme` attribute on `<html>` and tells `Experimental_CssVarsProvider` which scheme to activate via `colorSchemeSelector: '[data-color-scheme]'`. Import `next-themes` as `import { ThemeProvider as NextThemesProvider } from 'next-themes'` — it works in Vite SPAs. Wiring in `main.tsx`:

```tsx
// main.tsx
<NextThemesProvider attribute="data-color-scheme" defaultTheme="light">
  <Experimental_CssVarsProvider theme={theme} colorSchemeSelector="[data-color-scheme]" defaultColorScheme="light">
    <CssBaseline />
    <App />
  </Experimental_CssVarsProvider>
</NextThemesProvider>
```

`NextThemesProvider` is the outer wrapper; `Experimental_CssVarsProvider` is nested inside it. `next-themes` sets the attribute; MUI reads it. This app is Vite client-only — no SSR hydration concerns apply.

**Typography:** Geist Variable (`@fontsource-variable/geist`, already installed) overrides Roboto as the MUI theme font family.

---

## 3. Dependencies

### Add

| Package | Purpose |
|---|---|
| `@mui/material` v6 | Core MD3 components |
| `@mui/icons-material` | Material Symbols icon set |
| `@mui/lab` | Experimental MUI components (e.g. `LoadingButton`) — pin to the `6.x` pre-release that matches `@mui/material` exactly |
| `@mui/x-date-pickers` | Date picker replacing `react-day-picker` |
| `@emotion/react` | MUI required styling engine |
| `@emotion/styled` | MUI required styling engine |

### Remove

| Package | Reason |
|---|---|
| `shadcn` | Replaced by MUI |
| `tailwindcss` | Replaced by MUI `sx` prop and layout components |
| `@tailwindcss/vite` | No longer needed — remove from `vite.config.ts` |
| `tw-animate-css` | Replaced by MUI motion |
| `tailwind-merge` | No longer needed |
| `class-variance-authority` | No longer needed |
| `clsx` | No longer needed |
| `lucide-react` | Replaced by `@mui/icons-material` |
| `@base-ui/react` | Replaced by MUI |
| `react-day-picker` | Replaced by `@mui/x-date-pickers` |
| `sonner` | Replaced by MUI `Snackbar` + `Alert` |

### Unchanged

`react-hook-form`, `zod`, `axios`, `@tanstack/react-query`, `recharts`, `react-router-dom`, `next-themes`, `date-fns`

---

## 4. File Changes

### Delete
- `src/components/ui/` — all 16 shadcn primitives
- `src/index.css` — replaced by MUI `CssBaseline`
- `src/App.css`
- `components.json`

### Create
- `src/theme/index.ts` — `extendTheme` with MD3 seeds, Geist font, shape tokens, dark mode background overrides
- `src/theme/tokens.ts` — custom semantic colour tokens (status, charts)

### Modify
- `main.tsx` — wrap app with `Experimental_CssVarsProvider`, add `CssBaseline`
- `vite.config.ts` — remove `@tailwindcss/vite` plugin import and usage

---

## 5. Component Mapping

| shadcn | MUI replacement |
|---|---|
| `Button` | `Button` |
| `Input` | `TextField` |
| `Select` | `Select` + `MenuItem` |
| `Card` | `Card` + `CardContent` + `CardHeader` |
| `Dialog` | `Dialog` + `DialogTitle` + `DialogContent` + `DialogActions` |
| `Badge` | `Chip` |
| `Avatar` | `Avatar` |
| `Tabs` / `Tab` | `Tabs` + `Tab` |
| `Table` | `Table` + `TableHead` + `TableBody` + `TableRow` + `TableCell` |
| `Form` / `Label` | `FormControl` + `FormLabel` + `FormHelperText` |
| `Skeleton` | `Skeleton` |
| `Separator` | `Divider` |
| `Popover` | `Popover` |
| `Calendar` | `DateCalendar` (`@mui/x-date-pickers`) |
| `Sonner` (toasts) | `Snackbar` + `Alert` — anchor `bottom-right`, `autoHideDuration: 4000ms` to match existing sonner defaults |

`react-hook-form` integrates with MUI via `Controller`. Validation schemas (`zod`) are unchanged.

---

## 6. AppShell & Layout

The custom Tailwind sidebar becomes a standard MUI layout:

- **Root:** `Box` with `display: flex`
- **Sidebar:** `Drawer` with the following responsive behaviour using `theme.breakpoints.up('md')` (MUI default `md` = 900px — not overridden):
  - `md` and above: permanent `Drawer`, width `240px` expanded / `64px` collapsed. Collapse state persisted in `localStorage` (existing logic unchanged).
  - Below `md`: temporary `Drawer`, full-width overlay, toggled by `Menu` `IconButton` in `AppBar`. Controlled by existing `sidebarOpen` state.
- **Nav items:** `List` + `ListItemButton` + `ListItemIcon` + `ListItemText`. Active state via MUI `selected` prop — applies MD3 tonal highlight automatically.
- **Top bar:** `AppBar` + `Toolbar` — company switcher as `Menu`, user avatar + logout as `IconButton` + `Menu`.
- **Content area:** `Box` with `flexGrow: 1` and `overflow: auto`.
- **Idle timer modal:** `Dialog` (same logic, MUI wrapper).

---

## 7. Migration Order

The big-bang migration runs in a single feature branch with the following branch management rules:

- **Merge criteria:** TypeScript build passes (`tsc -b`), all existing Vitest tests pass, and every page renders without a blank screen or console error (manual smoke test of all 6 nav sections).
- **Rebase cadence:** Rebase onto `main` at the start of each work session to prevent long-lived divergence.
- **Rollback:** If a critical bug ships post-merge, revert the merge commit (`git revert -m 1 <merge-sha>`). The big-bang nature makes partial rollback impractical — full revert is the recovery path.

1. **Theme** — `src/theme/index.ts`, `src/theme/tokens.ts`, update `main.tsx`
2. **AppShell** — foundation for all pages
3. **Shared components** — `src/components/common/` (ConfirmModal, EmptyState, StatusBadge, Field, SkeletonTable, IdleTimerModal)
4. **Auth pages** — Login, Register, ForgotPassword, ResetPassword
5. **Core HR pages** — Dashboard, Employees, Payroll, Payslips
6. **All remaining pages** — Leave, Loans, Reports, Settings, Admin, Utilities, Attendance, Shifts, Devices

### Per-page checklist
- Remove all `className` Tailwind strings
- Replace `src/components/ui/*` imports with MUI equivalents
- Replace `lucide-react` imports with `@mui/icons-material`
- Replace shadcn form primitives with `Controller` + MUI `TextField`
- Replace `div` + Tailwind layout with `Box`, `Stack`, `Paper`

### Unchanged across all pages
- API layer (`src/api/client.ts`)
- Business logic (`src/lib/`, `src/hooks/`, `src/context/`)
- React Router structure (`App.tsx`)
- `recharts` chart components
- `react-hook-form` + `zod` schemas
