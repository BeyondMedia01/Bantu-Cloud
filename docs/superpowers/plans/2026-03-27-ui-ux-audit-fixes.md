# UI/UX Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all audit-identified UI/UX issues in severity order: Critical → High → Medium.

**Architecture:** Targeted component edits — no rewrites. Extract shared components where duplication exists. Add a11y attributes inline where missing. No new dependencies required.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Lucide React

---

## Files Modified / Created

| File | Action | Purpose |
|------|--------|---------|
| `src/components/ui/form.tsx` | Modify | Add `required` prop + asterisk to FormLabel |
| `src/components/ui/button.tsx` | Modify | Add `isLoading` prop + spinner |
| `src/components/employees/EmployeeFilters.tsx` | Modify | sr-only label on search; replace native selects with UI Select |
| `src/components/employees/EmployeeTable.tsx` | Modify | aria-labels, scope="col", text on status badges, mobile stacking, action grouping |
| `src/components/common/StatusBadge.tsx` | Create | Extracted reusable StatusBadge component |
| `src/components/common/ErrorBoundary.tsx` | Create | Global React error boundary |
| `src/components/common/EmptyState.tsx` | Create | Reusable empty state component |
| `src/context/ToastContext.tsx` | Modify | Add role="alert" + aria-live to toast container |
| `src/App.tsx` | Modify | Wrap routes in ErrorBoundary |
| `src/components/AppShell.tsx` | Modify | Mobile drawer max-w cap |

---

## Task 1: Add `required` asterisk to FormLabel

**Files:**
- Modify: `src/components/ui/form.tsx`

- [ ] Open `src/components/ui/form.tsx`. Find the `FormLabel` component. Add a `required` prop and render a red asterisk when true.

```tsx
// Replace the FormLabel function with:
function FormLabel({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  const { error, formItemId } = useFormField()

  return (
    <LabelPrimitive.Root
      data-slot="form-label"
      data-error={!!error}
      htmlFor={formItemId}
      className={cn('data-[error=true]:text-destructive', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
      )}
    </LabelPrimitive.Root>
  )
}
```

- [ ] Verify the file compiles (no TypeScript errors visible in editor).

---

## Task 2: Add `isLoading` prop to Button

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] Open `src/components/ui/button.tsx`. Add `isLoading` and `loadingText` props. When loading, show a spinner and disable the button.

```tsx
// Add to ButtonPrimitive.Props intersection:
interface ButtonExtraProps {
  isLoading?: boolean
  loadingText?: string
}

// Inside Button component, before return:
// const { isLoading, loadingText, children, disabled, className, variant, size, ...rest } = props

// Render:
<ButtonPrimitive.Root
  data-slot="button"
  className={cn(buttonVariants({ variant, size }), className)}
  disabled={disabled || isLoading}
  {...rest}
>
  {isLoading && (
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )}
  {isLoading && loadingText ? loadingText : children}
</ButtonPrimitive.Root>
```

- [ ] Read the actual file first to match exact structure, then apply the change carefully.

---

## Task 3: Fix EmployeeFilters — sr-only label + replace native selects

**Files:**
- Modify: `src/components/employees/EmployeeFilters.tsx`

- [ ] Read the full file. Add `<label htmlFor="employee-search" className="sr-only">Search employees</label>` above the search input and add `id="employee-search"` to the input.

- [ ] Replace the three native `<select>` elements with the shadcn `<Select>` component from `@/components/ui/select` (or relative path `../ui/select`). Pattern:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

// Replace each native <select> with:
<Select
  value={filters.branch}
  onValueChange={(val) => onFilterChange('branch', val)}
>
  <SelectTrigger className="h-9 text-sm">
    <SelectValue placeholder="All Branches" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">All Branches</SelectItem>
    {branches.map((b) => (
      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] Apply the same pattern for Department and Employment Type selects. Employment Type options: `['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME']`.

---

## Task 4: Create `StatusBadge` component

**Files:**
- Create: `src/components/common/StatusBadge.tsx`

- [ ] Create the file:

```tsx
import React from 'react'
import { cn } from '@/lib/utils'

type StatusVariant =
  | 'ACTIVE' | 'INACTIVE' | 'DISCHARGED' | 'SUSPENDED'
  | 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELLED'
  | 'PAID' | 'UNPAID' | 'DRAFT' | 'PROCESSING'

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  INACTIVE: 'bg-slate-50 text-slate-600 border-slate-100',
  DISCHARGED: 'bg-red-50 text-red-700 border-red-100',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
  REJECTED: 'bg-red-50 text-red-700 border-red-100',
  CANCELLED: 'bg-slate-50 text-slate-600 border-slate-100',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  UNPAID: 'bg-red-50 text-red-700 border-red-100',
  DRAFT: 'bg-slate-50 text-slate-600 border-slate-100',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-100',
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = STATUS_STYLES[status?.toUpperCase()] ?? 'bg-slate-50 text-slate-600 border-slate-100'
  const label = status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase()

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        styles,
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}
```

- [ ] Update `src/components/employees/EmployeeTable.tsx` to import and use `StatusBadge` instead of the inline span.

---

## Task 5: Fix EmployeeTable a11y — scope, aria-labels, mobile

**Files:**
- Modify: `src/components/employees/EmployeeTable.tsx`

- [ ] Read the full file. Add `scope="col"` to every `<th>` element.

- [ ] Add `aria-label` to the IT7 download icon button. Example:
```tsx
<button aria-label={`Download IT7 for ${employee.firstName} ${employee.lastName}`}>
  {/* icon */}
</button>
```

- [ ] Add `aria-label` to Edit and Delete buttons similarly.

- [ ] For the mobile-hidden columns (`hidden md:table-cell`), add a mobile data row below each employee row that shows Department and Branch on small screens:
```tsx
// After the main <tr>, add:
<tr className="md:hidden bg-slate-50/50 border-t-0">
  <td colSpan={5} className="px-5 py-2 text-xs text-slate-500">
    {employee.department?.name && <span className="mr-3"><span className="font-medium">Dept:</span> {employee.department.name}</span>}
    {employee.branch?.name && <span><span className="font-medium">Branch:</span> {employee.branch.name}</span>}
  </td>
</tr>
```

- [ ] Group Edit and Delete actions into a single Actions column with consistent spacing.

---

## Task 6: Create global ErrorBoundary + wire into App.tsx

**Files:**
- Create: `src/components/common/ErrorBoundary.tsx`
- Modify: `src/App.tsx`

- [ ] Create `src/components/common/ErrorBoundary.tsx`:

```tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-slate-900">Something went wrong</h1>
            <p className="mb-6 text-sm text-slate-500">
              An unexpected error occurred. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

- [ ] In `src/App.tsx`, import `ErrorBoundary` and wrap the router content:

```tsx
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Wrap the outermost JSX inside BrowserRouter (or QueryClientProvider):
<ErrorBoundary>
  {/* existing router / provider tree */}
</ErrorBoundary>
```

---

## Task 7: Fix Toast — add `role="alert"` and `aria-live`

**Files:**
- Modify: `src/context/ToastContext.tsx`

- [ ] Find the toast container div (the `fixed bottom-6 right-6` div). Add `role="status"` and `aria-live="polite"` to it:

```tsx
<div
  role="status"
  aria-live="polite"
  aria-atomic="false"
  className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
>
```

- [ ] For error toasts, use `role="alert"` and `aria-live="assertive"` since errors need immediate announcement. Conditionally apply based on `toast.type`:

```tsx
// Each toast div gets:
role={toast.type === 'error' ? 'alert' : 'status'}
aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
```

- [ ] Remove the wrapper `role="status"` from the container (it conflicts) — only individual toasts need the role.

---

## Task 8: Fix table headers `scope="col"` and add loading/empty state

**Files:**
- Modify: Any remaining table files not covered in Task 5

- [ ] Check `src/pages/Payslips.tsx`, `src/pages/Leave.tsx`, `src/pages/Payroll.tsx` — add `scope="col"` to all `<th>` elements in each.

- [ ] Add a "Showing X of Y items" count where tables exist. Add below the table or in the filter bar:

```tsx
<p className="text-xs text-slate-500 mt-2">
  Showing {data.length} {data.length === 1 ? 'result' : 'results'}
</p>
```

---

## Task 9: Create `EmptyState` component + apply to key pages

**Files:**
- Create: `src/components/common/EmptyState.tsx`
- Modify: `src/pages/Employees.tsx`, `src/pages/Leave.tsx`

- [ ] Create `src/components/common/EmptyState.tsx`:

```tsx
import React from 'react'
import { LucideIcon } from 'lucide-react'
import { Button } from '../ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm">{actionLabel}</Button>
      )}
    </div>
  )
}
```

- [ ] Replace bare empty-table text in `Employees.tsx` and `Leave.tsx` with `<EmptyState>`.

---

## Task 10: Fix AppShell mobile drawer width

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] Find the mobile drawer `<aside>` (around line 293-294). Change `w-56` to `w-56 max-w-[75vw]`:

```tsx
// Before:
className={`fixed top-0 left-0 h-screen w-56 bg-primary ...`}

// After:
className={`fixed top-0 left-0 h-screen w-56 max-w-[75vw] bg-primary ...`}
```

---

## Task 11: Add `scope="col"` to loading spinners aria

**Files:**
- Modify: `src/App.tsx` (PageLoader spinner)

- [ ] Find the spinner element in App.tsx (around line 136-140). Wrap with aria role:

```tsx
<div role="status" aria-label="Loading application">
  <div className="w-6 h-6 border-2 border-slate-300 border-t-navy rounded-full animate-spin" aria-hidden="true" />
  <span className="sr-only">Loading...</span>
</div>
```

---

## Final Verification

- [ ] Run `cd frontend && npm run build` — confirm zero TypeScript errors
- [ ] Run `npm run dev` — open app, check that no console errors appear
- [ ] Verify: search input has visible label in inspector
- [ ] Verify: status badges render correctly with StatusBadge component
- [ ] Verify: toast announcements work (open DevTools → Accessibility panel → trigger a toast)
- [ ] Verify: ErrorBoundary fallback renders (temporarily throw in a component)
