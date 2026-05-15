# Dashboard Apple Bento Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dashboard into an asymmetric Apple Bento grid with visually distinct cards, richer data density, and polished micro-details.

**Architecture:** Replace the current 4-equal-column grid with an explicit CSS grid using col/row spans. Refactor existing card contents in place — no new route files, no new API calls. One new sub-component `UnifiedCalendarCard` merges MiniCalendar + RemindersCard.

**Tech Stack:** React, Tailwind CSS (grid-cols, col-span, row-span), Recharts (existing), Lucide icons, TanStack Query (no changes)

---

## Grid Layout Target

```
Col:  1           2           3           4
Row1: Overview    Filing      Filing      Calendar
Row2: ExchRate    Filing      Filing      Calendar
Row3: SmartInsight CurrentRun (empty)    (empty)
```

- 4 columns, 3 rows
- Filing: col-span-2, row-span-2
- Calendar: col-span-1, row-span-2
- All others: 1×1

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/Dashboard.tsx` | New grid, refactored card JSX |
| `frontend/src/components/dashboard/FilingDeadlinesCard.tsx` | Visual polish: large day numbers, squircle tag icons |
| `frontend/src/components/dashboard/UnifiedCalendarCard.tsx` | NEW — merges MiniCalendar + RemindersCard into one card |
| `frontend/src/components/dashboard/MiniCalendar.tsx` | No structural change; accept `compact` prop to reduce padding |
| `frontend/src/components/dashboard/RemindersCard.tsx` | No structural change |

---

## Task 1: Restructure Dashboard Grid

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

Replace the `<div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">` section with a 4-col explicit grid using `grid-rows` and explicit `col-span`/`row-span` classes.

- [ ] **Step 1: Replace outer grid div**

Change:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
  {/* Column 1: Overview & Payroll */}
  <div className="flex flex-col gap-4"> ... </div>
  {/* Column 2-3: Filing Deadlines */}
  <div className="lg:col-span-2 flex flex-col gap-6 h-full">
    <FilingDeadlinesCard holidays={holidays} />
  </div>
  {/* Column 4: Calendar & Reminders */}
  <div className="flex flex-col gap-4 h-full">
    <Card className="overflow-hidden p-0 shrink-0">
      <MiniCalendar ... />
    </Card>
    <Card className="overflow-hidden p-0 flex-1">
      <RemindersCard ... />
    </Card>
  </div>
</div>
```

To this new structure (keep inner card JSX in place for now — we'll refine in later tasks):
```tsx
<div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-3 gap-5 items-stretch">

  {/* [1,1] Overview */}
  <div className="lg:col-start-1 lg:row-start-1">
    {/* Overview card — inner content unchanged for now */}
  </div>

  {/* [1,2] Exchange Rate */}
  <div className="lg:col-start-1 lg:row-start-2">
    {/* Exchange rate card — inner content unchanged for now */}
  </div>

  {/* [1,3] Smart Insight / Compliance */}
  <div className="lg:col-start-1 lg:row-start-3">
    {/* Compliance health or current run — see Task 3 */}
  </div>

  {/* [2-3, 1-2] Filing Deadlines — 2 cols × 2 rows */}
  <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:row-span-2">
    <FilingDeadlinesCard holidays={holidays} />
  </div>

  {/* [2, 3] Current Run */}
  <div className="lg:col-start-2 lg:row-start-3">
    {/* Current Run card — Task 4 */}
  </div>

  {/* [4, 1-2] Unified Calendar — 1 col × 2 rows */}
  <div className="lg:col-start-4 lg:row-start-1 lg:row-span-2">
    <UnifiedCalendarCard
      reminders={reminders}
      holidays={holidays}
      selectedDay={selectedDay}
      onDateSelect={setSelectedDay}
      loading={loading}
    />
  </div>

</div>
```

- [ ] **Step 2: Move Exchange Rate card out of col-1 flex wrapper**

Currently Exchange Rate is the third item inside the col-1 flex div. Extract it to its own grid cell at `[1,2]`.

- [ ] **Step 3: Move Current Run card out of col-1 flex wrapper**

Extract the currentRun / lastRun / no-run conditional into the `[2,3]` cell.

- [ ] **Step 4: Keep Overview card in `[1,1]` cell**

The Overview card (donut + SummaryItems + Add Employee button) stays in `[1,1]` — no content changes yet.

- [ ] **Step 5: Verify layout renders on lg screen**

Run `npm run dev` in frontend, open browser, confirm 4-col bento grid at lg breakpoint. No content changes expected yet — just structural placement.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): restructure to 4-col bento grid with explicit row/col spans"
```

---

## Task 2: Create UnifiedCalendarCard

**Files:**
- Create: `frontend/src/components/dashboard/UnifiedCalendarCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx` (import + use)

The existing separate Card wrappers for MiniCalendar and RemindersCard are replaced by a single card that fills the 2-row span. MiniCalendar on top, events list below with a subtle divider.

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/dashboard/UnifiedCalendarCard.tsx
import React, { useState } from 'react';
import MiniCalendar from './MiniCalendar';
import RemindersCard from './RemindersCard';
import type { PublicHoliday } from '../../api/client';
import type { ReminderItem } from '../../api/client';

interface Props {
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  holidays: PublicHoliday[];
  selectedDay: Date;
  onDateSelect: (d: Date) => void;
  loading: boolean;
}

const UnifiedCalendarCard: React.FC<Props> = ({ reminders, holidays, selectedDay, onDateSelect, loading }) => (
  <div className="bg-primary rounded-2xl border border-border shadow-sm h-full flex flex-col overflow-hidden">
    <MiniCalendar
      reminders={reminders}
      holidays={holidays}
      selectedDay={selectedDay}
      onDateSelect={onDateSelect}
    />
    <div className="h-px bg-border mx-4" />
    <div className="flex-1 overflow-hidden">
      <RemindersCard reminders={reminders} loading={loading} selectedDay={selectedDay} />
    </div>
  </div>
);

export default UnifiedCalendarCard;
```

- [ ] **Step 2: Import and use in Dashboard.tsx**

Replace the two separate `<Card>` wrappers in the calendar cell with `<UnifiedCalendarCard ... />`.

- [ ] **Step 3: Verify MiniCalendar + RemindersCard render correctly inside the new wrapper**

Check that the calendar's internal padding/borders look right and RemindersCard fills the remaining height.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/dashboard/UnifiedCalendarCard.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): unify calendar and reminders into single bento card"
```

---

## Task 3: Polish Overview Card (Donut with Center Number)

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` (Overview card section only)

Add the employee count as a centered label inside the donut ring, and tighten the card's visual layout.

- [ ] **Step 1: Add center label to PieChart**

Recharts `PieChart` supports a `label` prop on `Pie`, but centering text inside the ring requires a custom label or an absolute-positioned overlay. Use overlay approach:

```tsx
{/* Donut with centered count */}
<div className="relative flex justify-center">
  <div className="w-24 h-24">
    {loading ? (
      <Skeleton className="w-24 h-24 rounded-full" />
    ) : (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={44} paddingAngle={3} dataKey="value" />
        </PieChart>
      </ResponsiveContainer>
    )}
  </div>
  {!loading && (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span className="text-lg font-bold leading-none">{summary?.employeeCount ?? 0}</span>
      <span className="text-[9px] text-muted-foreground font-bold uppercase">staff</span>
    </div>
  )}
</div>
```

- [ ] **Step 2: Remove the `<Separator />` between donut and list**

Replace with tighter spacing (`gap-3`). The list already has enough visual separation.

- [ ] **Step 3: Verify number centers correctly in donut hole**

Check at 96px size that "99" fits without overflow. Adjust font size if needed.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): add centered employee count in overview donut"
```

---

## Task 4: Polish Exchange Rate Card (Hero Layout)

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` (Exchange Rate card section)

Make the rate number large and prominent, add the effective date below as a caption, and add a subtle "live" indicator dot.

- [ ] **Step 1: Replace Exchange Rate card content**

```tsx
<div className="bg-primary rounded-2xl border border-border shadow-sm p-5 h-full flex flex-col gap-3">
  <div className="flex items-center justify-between">
    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">USD / ZiG Rate</p>
    {exchangeRate && (
      <span className="flex items-center gap-1 text-[10px] font-bold text-success">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        Live
      </span>
    )}
  </div>
  {exchangeRateLoading ? (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  ) : exchangeRate ? (
    <>
      <p className="text-2xl font-bold leading-none">
        {Number(exchangeRate.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span className="text-sm font-bold text-muted-foreground ml-1">{exchangeRate.toCurrency}</span>
      </p>
      <p className="text-[10px] text-muted-foreground font-medium">per 1 {exchangeRate.fromCurrency} · {fmtDate(exchangeRate.effectiveDate)}</p>
    </>
  ) : (
    <button onClick={() => navigate('/currency-rates')} className="text-sm font-bold text-accent-green hover:underline">
      Set USD/ZiG rate →
    </button>
  )}
</div>
```

Note: Remove the `<Card>` wrapper and use a raw div — matches the bento card style of FilingDeadlinesCard.

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): hero layout for exchange rate bento card"
```

---

## Task 5: Polish Current Run Card (Action Card)

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` (Current Run / Last Run section)

Give the current run card a more prominent action-focused design: status pill with glow, period name as headline, and a "Continue →" CTA.

- [ ] **Step 1: Replace currentRun card JSX**

```tsx
{/* [2,3] Current Run / Last Run */}
<div>
  {loading ? (
    <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-3 w-20" />
    </div>
  ) : currentRun ? (
    <button
      onClick={() => navigate('/payroll')}
      className="w-full text-left bg-primary rounded-2xl border border-border shadow-sm p-5 hover:border-brand/40 transition-colors flex flex-col gap-3 h-full"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Current Run</p>
        <StatusBadge status={currentRun.status} />
      </div>
      <p className="font-bold text-sm leading-snug">{currentRun.name}</p>
      <p className="text-[10px] text-muted-foreground font-medium">{fmtDate(currentRun.runDate)} · {currentRun.currency}</p>
      <p className="text-xs font-bold text-brand mt-auto">Continue payroll →</p>
    </button>
  ) : summary?.lastRun ? (
    <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-2 h-full">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Last Payroll</p>
      <p className="font-bold text-sm">{fmtDate(summary.lastRun.runDate)}</p>
      <StatusBadge status="COMPLETED" />
      <button onClick={() => navigate('/payroll/new')} className="text-xs font-bold text-accent-green hover:underline mt-auto">
        Start new run →
      </button>
    </div>
  ) : (
    <button
      onClick={() => navigate('/payroll/new')}
      className="w-full text-left bg-accent-green/5 rounded-2xl border border-accent-green/20 shadow-sm p-5 hover:border-accent-green/40 transition-colors flex flex-col gap-2 h-full"
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Next Action</p>
      <p className="font-bold text-sm text-accent-green">Start payroll run →</p>
    </button>
  )}
</div>
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): action-focused current run bento card"
```

---

## Task 6: Polish FilingDeadlinesCard (Large Day Numbers)

**Files:**
- Modify: `frontend/src/components/dashboard/FilingDeadlinesCard.tsx`

Increase visual impact: large day-of-month number as the hero element, month abbreviation below it, tag pill in top-right, and the name + countdown below.

- [ ] **Step 1: Redesign each deadline card cell**

Replace the current cell JSX inside the `.map()`:

Current:
```tsx
<div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 h-full ${borderColor}`}>
  <div className="flex items-center justify-between gap-1">
    <span className={...}>{d.tag}</span>
    {isFiled ? <CheckCircle2 .../> : urgent && !isFinance && <AlertTriangle .../>}
  </div>
  <div>
    <p ...>{d.name}</p>
    <p ...>{d.description}</p>
  </div>
  <div className="mt-auto flex items-end justify-between gap-1">
    <div>
      <p ...>{d.dueDate.toLocaleDateString(...)}</p>
      <p ...>{isFiled ? 'Filed' : days === 0 ? 'Due today' : ...}</p>
    </div>
    <button ...>{isFiled ? 'Undo' : 'File'}</button>
  </div>
</div>
```

Replace with:
```tsx
<div key={i} className={`rounded-xl border p-3 flex flex-col gap-1.5 h-full ${borderColor}`}>
  {/* Top row: tag + status icon */}
  <div className="flex items-center justify-between">
    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${TAG_COLORS[d.tag]}`}>
      {d.tag}
    </span>
    {isFiled
      ? <CheckCircle2 size={12} className="text-success shrink-0" />
      : urgent && !isFinance && <AlertTriangle size={12} className="text-red-500 shrink-0" />
    }
  </div>

  {/* Hero: large day number */}
  <div className="flex items-baseline gap-1">
    <span className={`text-3xl font-black leading-none tabular-nums ${isFiled ? 'text-muted-foreground' : urgent && !isFinance ? 'text-red-600' : 'text-navy'}`}>
      {d.dueDate.getDate()}
    </span>
    <span className="text-xs font-bold text-muted-foreground">
      {d.dueDate.toLocaleDateString(undefined, { month: 'short' })}
    </span>
  </div>

  {/* Name */}
  <p className={`text-[10px] font-bold leading-tight ${isFiled ? 'text-muted-foreground line-through' : 'text-navy'}`}>
    {d.name}
  </p>

  {/* Bottom: countdown + file button */}
  <div className="mt-auto flex items-center justify-between gap-1 pt-1">
    <p className={`text-[9px] font-bold ${daysColor}`}>
      {isFiled ? 'Filed ✓' : days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days}d`}
    </p>
    <button
      onClick={() => toggle(d)}
      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-colors ${
        isFiled
          ? 'border-success-border text-success hover:bg-destructive-bg hover:text-destructive hover:border-destructive/30'
          : 'border-border text-muted-foreground hover:border-success-border hover:text-success hover:bg-success-bg'
      }`}
    >
      {isFiled ? 'Undo' : 'File'}
    </button>
  </div>
</div>
```

- [ ] **Step 2: Verify all 8 deadline cards render correctly**

Check urgent (red), soon (amber), filed (green strikethrough), and normal states all look right.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/dashboard/FilingDeadlinesCard.tsx
git commit -m "feat(dashboard): large day-number hero layout for filing deadline cards"
```

---

## Task 7: Visual Polish Pass

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

Tighten up spacing, ensure all raw-div cards use consistent styling (`bg-primary rounded-2xl border border-border shadow-sm`), and add card-level hover transitions.

- [ ] **Step 1: Audit all card wrappers in Dashboard.tsx**

Identify any remaining `<Card>` components in the bento grid and replace with the raw div pattern if they need custom height behavior. `<Card>` from shadcn adds `rounded-lg` — override to `rounded-2xl` if keeping.

- [ ] **Step 2: Add `min-h` to row 3 cells**

Row 3 (Smart Insight + Current Run) will be shorter than rows 1-2. Add `min-h-[120px]` to these cells so they don't collapse.

- [ ] **Step 3: Ensure mobile fallback**

On mobile (`< lg`), the grid should stack as flex-col. The `grid-cols-1` at mobile breakpoint handles this — verify the row-span/col-span classes only apply at `lg:`.

- [ ] **Step 4: Move "Add Employee" button to Overview card bottom**

Confirm it still renders correctly in the new layout.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): visual polish — consistent card radius, spacing, mobile fallback"
```

---

## Task 8: Push to Main

- [ ] **Step 1: Final review**

```bash
cd frontend && npm run build
```

Confirm no TypeScript errors.

- [ ] **Step 2: Push**
```bash
git push origin main
```
