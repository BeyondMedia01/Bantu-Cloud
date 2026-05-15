# UI/UX Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 16 UI/UX inconsistencies catalogued in the May 2026 audit — component adoption, dead code, accessibility gaps, and data-integrity bugs.

**Architecture:** No new components or abstractions. Fix issues by adopting components that already exist (`StatusBadge`, `scroll-x-shadow`, `dialog.tsx`) and patching the critical bugs (submit-outside-form, Reports loading gap, modal a11y). EmployeeEdit is the one large rewrite needed; all other tasks are surgical edits.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Hook Form, Zod, @base-ui/react Dialog, TanStack Query

---

## Task Order (impact / risk)

| # | Task | Risk | Effort |
|---|------|------|--------|
| 1 | Expenses submit-button-outside-form bug | Critical | 5 min |
| 2 | Reports missing run-loading state | High | 15 min |
| 3 | `scroll-x-shadow` on all table wrappers | Low | 20 min |
| 4 | `StatusBadge` adoption across all pages | Low | 45 min |
| 5 | `text-foreground/60` → `text-muted-foreground` in Field.tsx | Low | 5 min |
| 6 | Modal a11y (role, aria-modal, Escape, backdrop) | Medium | 60 min |
| 7 | EmployeeEdit.tsx — migrate to RHF + Zod + shadcn inputs | High | 3–4 h |

Tasks 1–6 are independent. Task 7 (EmployeeEdit) is last because it's the largest rewrite and should be done in isolation.

---

## Task 1: Fix Expenses Submit Button Outside `<form>`

**Files:**
- Modify: `frontend/src/pages/Expenses.tsx`

The "Create Expense" button at line ~355 is rendered outside the `<form>` that ends at line ~352. The button uses `onClick={handleCreate}` as a workaround. The fix is to move the button row inside the form and change it to `type="submit"`.

- [ ] **Step 1: Locate the form and button**

  Open `frontend/src/pages/Expenses.tsx`. Find the pattern:
  ```
  </form>                          ← form ends here
  <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
    <button onClick={() => { setShowNew(false); resetForm(); }}>Cancel</button>
    <button onClick={handleCreate as any} ...>Create Expense</button>
  </div>
  ```

- [ ] **Step 2: Move the button row inside the form**

  Cut the entire `<div className="flex justify-end gap-3 ...">...</div>` block and paste it as the last child of the `<form>`, before `</form>`. Change `onClick={handleCreate as any}` to `type="submit"` and remove the `onClick` prop from the submit button. The `handleCreate` function is already the form's `onSubmit` handler so this just makes the HTML correct.

  Result:
  ```tsx
  <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
    {/* ... existing fields ... */}
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
      <button type="button" onClick={() => { setShowNew(false); resetForm(); }} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
      <button type="submit" disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
        <Plus size={16} /> {submitting ? 'Creating...' : 'Create Expense'}
      </button>
    </div>
  </form>
  ```

- [ ] **Step 3: Verify**

  Open Expenses in browser. Create a new expense — the form should submit on Enter key press now (previously it didn't because the button was outside the form).

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/src/pages/Expenses.tsx
  git commit -m "fix: move expense submit button inside form element"
  ```

---

## Task 2: Reports — Add Loading State for Payroll Runs

**Files:**
- Modify: `frontend/src/pages/Reports.tsx`

When the page loads it fetches payroll runs but shows an empty, disabled selector with no indication that data is loading. Add `loadingRuns` state.

- [ ] **Step 1: Add `loadingRuns` state**

  In `Reports.tsx` add after the existing state declarations:
  ```tsx
  const [loadingRuns, setLoadingRuns] = useState(true);
  ```

- [ ] **Step 2: Set state around the runs fetch**

  Wrap the existing `http.get('/payroll', ...)` call:
  ```tsx
  setLoadingRuns(true);
  http.get('/payroll', { params: { companyId, status: 'COMPLETED' } })
    .then(res => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setRuns(list);
      if (list.length > 0) setSelectedRunId(list[0].id);
    })
    .catch(() => showToast('Failed to load payroll runs', 'error'))
    .finally(() => setLoadingRuns(false));
  ```

- [ ] **Step 3: Show loading indicator in the run selector**

  Find where `selectedRunId` is rendered (the payroll run `<Dropdown>` or `<select>`). Wrap or replace with:
  ```tsx
  {loadingRuns ? (
    <div className="h-10 bg-muted animate-pulse rounded-xl w-full" />
  ) : (
    {/* existing run selector JSX */}
  )}
  ```
  Also disable the run-dependent export buttons while `loadingRuns` is true by adding `|| loadingRuns` to their `disabled` conditions.

- [ ] **Step 4: Verify**

  Hard-reload Reports. You should see a pulsing skeleton where the run selector was instead of a broken empty state.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/pages/Reports.tsx
  git commit -m "fix: add loading skeleton for payroll runs in Reports"
  ```

---

## Task 3: Add `scroll-x-shadow` to All Overflow Tables

**Files to modify** (all have `overflow-x-auto` without `scroll-x-shadow`):
- `frontend/src/pages/Grades.tsx`
- `frontend/src/pages/NecTables.tsx`
- `frontend/src/pages/PayslipExports.tsx`
- `frontend/src/pages/TaxTableSettings.tsx`
- `frontend/src/pages/PayTransactions.tsx`
- `frontend/src/pages/LeaveBalances.tsx`
- `frontend/src/pages/PayrollUsers.tsx`
- `frontend/src/pages/PayrollInputs.tsx`
- `frontend/src/pages/PayrollCore.tsx`
- `frontend/src/pages/CurrencyRates.tsx`
- `frontend/src/pages/Payroll.tsx`
- `frontend/src/pages/NSSAContributions.tsx`
- `frontend/src/pages/ClientAdminStructure.tsx` (line 299 only — not the tab bar at 242)
- `frontend/src/pages/PayslipTransactions.tsx`
- `frontend/src/pages/Loans.tsx`
- `frontend/src/pages/PayrollSummary.tsx`

Skip: `PayrollInputGrid.tsx` (the paste handler on that div makes it intentional); `Recruitment.tsx` and `Surveys.tsx` (tab bar scroll, not table).

- [ ] **Step 1: Do a bulk replace**

  For each file listed above, change:
  ```
  className="overflow-x-auto"
  ```
  to:
  ```
  className="overflow-x-auto scroll-x-shadow"
  ```

  Use the IDE find-replace or run:
  ```bash
  # Preview first
  grep -rn '"overflow-x-auto"' frontend/src/pages/ | grep -v "PayrollInputGrid\|Recruitment\|Surveys\|ClientAdminStructure.tsx:242"
  ```

  Then edit each file. There are typically 1 occurrence per file.

- [ ] **Step 2: Verify visually**

  Open a page with a wide table (e.g., Loans, Payroll) on a narrow viewport. The shadow indicator should appear on the right edge when the table is horizontally scrollable.

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/src/pages/
  git commit -m "fix: add scroll-x-shadow to all horizontal table wrappers"
  ```

---

## Task 4: `StatusBadge` Adoption — Remove Inline Status Color Maps

**Files with inline status maps to replace:**

| File | Local map name | Statuses rendered |
|------|---------------|-------------------|
| `Leave.tsx` | `STATUS_COLORS` | PENDING, APPROVED, REJECTED, CANCELLED |
| `LeaveEncashments.tsx` | `STATUS_STYLE` | PENDING, APPROVED, REJECTED, PROCESSED |
| `Loans.tsx` | `statusColor` | ACTIVE, COMPLETED, DEFAULTED |
| `Payroll.tsx` | `RUN_STATUS_CLASS` | DRAFT, PROCESSING, COMPLETED, FAILED |
| `PayrollSummary.tsx` | `RUN_STATUS_CLASS` | same |
| `Dashboard.tsx` | `RUN_STATUS_CLASS` | same |
| `Recruitment.tsx` | `POSTING_STATUS_COLORS`, `APP_STATUS_COLORS` | OPEN, CLOSED, SHORTLISTED, etc. |
| `Surveys.tsx` | `STATUS_COLORS` | DRAFT, ACTIVE, CLOSED |
| `Succession.tsx` | `STATUS_COLORS` | |
| `Assets.tsx` | `STATUS_COLORS` | |
| `Onboarding.tsx` | `STATUS_COLORS` | |
| `LoanDetail.tsx` | inline ternary | PAID, DUE |

**Important:** `StatusBadge` already covers: ACTIVE, INACTIVE, DISCHARGED, SUSPENDED, APPROVED, PENDING, REJECTED, CANCELLED, PAID, UNPAID, DRAFT, PROCESSING. For statuses it doesn't know (`COMPLETED`, `DEFAULTED`, `OPEN`, `CLOSED`, `SHORTLISTED`, `DUE`, `FAILED`, `PROCESSED`) — add them to `STATUS_STYLES` in `StatusBadge.tsx` first, then replace the call sites.

- [ ] **Step 1: Extend `StatusBadge` with missing statuses**

  Open `frontend/src/components/common/StatusBadge.tsx`. Add to `STATUS_STYLES`:
  ```tsx
  COMPLETED:   'bg-success-bg text-success border-success-border',
  FAILED:      'bg-destructive-bg text-destructive border-destructive/30',
  DEFAULTED:   'bg-destructive-bg text-destructive border-destructive/30',
  OPEN:        'bg-info-bg text-info border-info-border',
  CLOSED:      'bg-muted text-muted-foreground/80 border-border',
  SHORTLISTED: 'bg-warning-bg text-warning border-warning-border',
  DUE:         'bg-warning-bg text-warning border-warning-border',
  PROCESSED:   'bg-success-bg text-success border-success-border',
  OVERDUE:     'bg-destructive-bg text-destructive border-destructive/30',
  ```

- [ ] **Step 2: Add import to each file**

  Each file needs:
  ```tsx
  import { StatusBadge } from '@/components/common/StatusBadge';
  ```

- [ ] **Step 3: Replace inline status spans — Leave.tsx**

  Find:
  ```tsx
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[item.status] || 'bg-muted text-foreground/80'}`}>
    {item.status}
  </span>
  ```
  Replace with:
  ```tsx
  <StatusBadge status={item.status} />
  ```
  Delete the `STATUS_COLORS` constant at the top of the file.

- [ ] **Step 4: Replace — LeaveEncashments.tsx**

  Same pattern. Delete `STATUS_STYLE` constant, replace the `<span>` with `<StatusBadge status={enc.status} />`.

- [ ] **Step 5: Replace — Loans.tsx**

  Find `statusColor` map and the `<span className={...statusColor[loan.status]...}>` usage. Replace with `<StatusBadge status={loan.status} />`. Delete the map.

- [ ] **Step 6: Replace — Payroll.tsx, PayrollSummary.tsx, Dashboard.tsx**

  These share the same `RUN_STATUS_CLASS` pattern for payroll run statuses. In each file, replace the `<span>` with `<StatusBadge status={run.status} />` (or `currentRun.status` in Dashboard). Delete the local map only in files where it has no other usage.

- [ ] **Step 7: Replace — Recruitment.tsx**

  Two maps: `POSTING_STATUS_COLORS` and `APP_STATUS_COLORS`. Replace both sets of `<span>` usages with `<StatusBadge status={p.status} />` and `<StatusBadge status={a.status} />`. Delete both maps.

- [ ] **Step 8: Replace — Surveys.tsx, Succession.tsx, Assets.tsx, Onboarding.tsx**

  Same pattern in each. Replace `<span className={STATUS_COLORS[...]}>{status}</span>` with `<StatusBadge status={...} />`. Delete the local maps.

- [ ] **Step 9: Replace — LoanDetail.tsx**

  Find the inline ternary:
  ```tsx
  r.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
  r.status === 'DUE'  ? 'bg-amber-50 text-amber-700' : ...
  ```
  Replace the `<span>` with `<StatusBadge status={r.status} />`.

- [ ] **Step 10: TypeScript check**
  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Fix any type errors.

- [ ] **Step 11: Commit**
  ```bash
  git add frontend/src/components/common/StatusBadge.tsx frontend/src/pages/
  git commit -m "refactor: adopt StatusBadge across all pages, remove inline color maps"
  ```

---

## Task 5: Align Label Color — `text-foreground/60` → `text-muted-foreground`

**Files:**
- Modify: `frontend/src/components/common/Field.tsx`

- [ ] **Step 1: Read the file**

  Open `frontend/src/components/common/Field.tsx`. Find the label element using `text-foreground/60`.

- [ ] **Step 2: Change to `text-muted-foreground`**

  Replace `text-foreground/60` with `text-muted-foreground` in the label className. This aligns Field labels with every other label in the app and prevents dark-mode drift.

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/src/components/common/Field.tsx
  git commit -m "fix: align Field label color to text-muted-foreground"
  ```

---

## Task 6: Modal Accessibility — role, aria-modal, Escape, Backdrop Dismiss

The hand-rolled modals across the app lack `role="dialog"`, `aria-modal`, Escape-key handling, and backdrop-click dismiss. This task patches each one. We're NOT converting them to the Dialog component — we're adding the minimum a11y attributes and interaction behaviours to the existing DOM structure.

**Files with hand-rolled modals to patch:**

| File | Modal triggers |
|------|---------------|
| `Expenses.tsx` | New Expense, New Category, Reject modal |
| `Assets.tsx` | New Asset modal |
| `Training.tsx` | New Course, New Enrollment modals |
| `Recruitment.tsx` | New Posting, New Application modals |
| `Performance.tsx` | New Review, New Goal modals |
| `Surveys.tsx` | New Survey modal |
| `Succession.tsx` | New Plan modal |
| `Onboarding.tsx` | New Task modal |

**Pattern to apply to every modal overlay `<div>`:**

```tsx
// BEFORE
<div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
  <div className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col">

// AFTER
<div
  className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
  onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col"
    onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    tabIndex={-1}
  >
```

Where `onClose` is the state setter that hides the modal (e.g., `() => setShowNew(false)`).

Also: add `id="modal-title"` to the `<h2>` inside each modal header.

- [ ] **Step 1: Expenses.tsx — patch 3 modals**

  There are 3 hand-rolled modals: New Expense (`showNew`), New Category (`showNewCat`), and Reject (`showReject`).

  For each modal, apply the pattern above. The close handler for each:
  - New Expense: `() => { setShowNew(false); resetForm(); }`
  - New Category: `() => setShowNewCat(false)`
  - Reject: `() => setShowReject(null)`

  Add `id="modal-title"` to the `<h2>New Expense</h2>`, `<h2>New Category</h2>`, and `<h2>Reject Expense</h2>`.

  Also fix the reject modal button colour to match ConfirmModal: change `bg-red-600` to `bg-red-500`.

- [ ] **Step 2: Assets.tsx — patch modal**

  Same pattern. Close handler: `() => setShowModal(false)`.

- [ ] **Step 3: Training.tsx — patch modals**

  Two modals. Apply pattern to both.

- [ ] **Step 4: Recruitment.tsx — patch modals**

  Two modals. Apply pattern to both.

- [ ] **Step 5: Performance.tsx — patch modals**

  Two modals. Apply pattern to both.

- [ ] **Step 6: Surveys.tsx — patch modal**

- [ ] **Step 7: Succession.tsx — patch modal**

- [ ] **Step 8: Onboarding.tsx — patch modal**

- [ ] **Step 9: Verify**

  Open each page with a modal. Verify:
  - Clicking the dark backdrop closes the modal
  - Pressing Escape closes the modal
  - Screen reader (or VoiceOver quick nav) announces `role="dialog"`

- [ ] **Step 10: Commit**
  ```bash
  git add frontend/src/pages/
  git commit -m "fix: add role, aria-modal, Escape, and backdrop-dismiss to all hand-rolled modals"
  ```

---

## Task 7: EmployeeEdit.tsx — Migrate to RHF + Zod + Consistent Components

**Files:**
- Modify: `frontend/src/pages/EmployeeEdit.tsx` (983 lines)
- Reference: `frontend/src/pages/EmployeeNew.tsx` (same schema, already uses RHF+Zod)

This is the largest task. EmployeeEdit uses raw DOM inputs, hand-rolled state, `type="date"` native pickers, the custom `Dropdown` component, and no validation schema. EmployeeNew already solves all of these — use it as the canonical pattern.

**Approach:** Replace the `form` state object and hand-rolled `onChange` handlers with `useForm<EmployeeFormValues>()` from React Hook Form. Apply the same Zod schema used in EmployeeNew (or extract it to a shared file if not already shared). Replace raw `<input>` elements with the `<Input>` shadcn component and date fields with the `<Calendar>`/date picker pattern from EmployeeNew.

- [ ] **Step 1: Check if EmployeeNew's Zod schema is already extracted**

  ```bash
  grep -n "z.object\|employeeSchema\|EmployeeFormValues" frontend/src/pages/EmployeeNew.tsx
  ```

  If the schema is inline in EmployeeNew (not in a shared file), extract it:
  - Create `frontend/src/lib/schemas/employee.schema.ts`
  - Move the `z.object({...})` and `type EmployeeFormValues` export there
  - Update EmployeeNew to import from the shared file

- [ ] **Step 2: Set up RHF in EmployeeEdit**

  Replace:
  ```tsx
  const [form, setForm] = useState<Record<string, any>>({...});
  const set = (field: string) => ...;
  ```
  With:
  ```tsx
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { employeeSchema, type EmployeeFormValues } from '@/lib/schemas/employee.schema';

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { /* same fields as the old form state */ },
  });
  ```

- [ ] **Step 3: Populate form from fetched employee data**

  The existing `useEffect` fetches the employee and calls `setForm(data)`. Replace with:
  ```tsx
  // After fetching employee:
  Object.entries(data).forEach(([key, value]) => setValue(key as any, value));
  ```

- [ ] **Step 4: Replace `<input>` elements with `<Input>` component**

  For each text/number/email input:
  ```tsx
  // BEFORE
  <input type="text" value={form.firstName} onChange={set('firstName')} />

  // AFTER
  <Input type="text" {...register('firstName')} />
  {errors.firstName && <p className="text-xs text-destructive mt-1">{errors.firstName.message}</p>}
  ```

  Date inputs — replace `<input type="date">` with the same date picker component used in EmployeeNew (the shadcn Calendar + Popover pattern).

- [ ] **Step 5: Replace Dropdown usages for selects**

  The existing code uses the custom `Dropdown` component. Replace with shadcn `Select` (the same `select.tsx` component used in EmployeeNew):
  ```tsx
  // BEFORE
  <Dropdown trigger={...} sections={[{ items: [...] }]} />

  // AFTER
  <Select onValueChange={(v) => setValue('departmentId', v)} value={watch('departmentId')}>
    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
    <SelectContent>
      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
    </SelectContent>
  </Select>
  ```

- [ ] **Step 6: Wire up `handleSubmit`**

  Replace the existing `onSubmit` event handler with:
  ```tsx
  <form onSubmit={handleSubmit(async (data) => {
    setLoading(true);
    try {
      await EmployeeAPI.update(id!, data);
      showToast('Employee updated', 'success');
      navigate(`/employees/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  })}>
  ```

- [ ] **Step 7: TypeScript check + visual review**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Open EmployeeEdit on a real employee. Verify all fields populate, all dropdowns work, and submitting with blank required fields shows inline errors.

- [ ] **Step 8: Commit**
  ```bash
  git add frontend/src/pages/EmployeeEdit.tsx frontend/src/lib/schemas/
  git commit -m "refactor: migrate EmployeeEdit to React Hook Form + Zod + shadcn inputs"
  ```

---

## Out of Scope (Document, Don't Fix Now)

These items from the audit are deliberately excluded to keep this plan executable:

- **PageShell / TabBar / LoadingSkeleton / Button dead code** — deleting or adopting these touches 40+ pages. Worth a dedicated clean-up session after the above is stable.
- **Breadcrumbs** — requires router-level work and design decisions about the hierarchy display.
- **Filter pattern unification** — cosmetic inconsistency, not a bug; defer to next design pass.
- **44px touch targets** — affects every table action button; defer to mobile-focused polish pass.
- **Three page header patterns** — no user-facing impact, cosmetic; defer.
