# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a three-layer design system (token, primitive, pattern) that enforces visual consistency across the Bantu platform and provides a canonical reference for all future development.

**Architecture:** Layer 1 fixes `index.css` (add `--color-brand`, retire `--color-btn-primary`, complete dark mode chart tokens). Layer 2 adds seven structural React components to `frontend/src/components/ui/`. Layer 3 is documentation only — the Pattern Layer patterns are documented in the spec and referenced from `Design.md`.

**Tech Stack:** React 18, Tailwind CSS v4, shadcn/ui (Radix UI primitives), lucide-react, @tanstack/react-query v5, Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/index.css` | Modify | Add `--color-brand`, fix dark chart tokens, remove `--color-btn-primary` |
| `frontend/src/components/ui/page-shell.tsx` | Create | Page header wrapper with back button, title, subtitle, actions slot |
| `frontend/src/components/ui/section-card.tsx` | Create | Shadcn Card with uppercase label header pattern |
| `frontend/src/components/ui/tab-bar.tsx` | Create | Pill-style controlled tab switcher with ARIA roles |
| `frontend/src/components/ui/stat-card.tsx` | Create | Single dashboard metric tile |
| `frontend/src/components/ui/empty-state.tsx` | Create | Three-variant empty list component (replaces `components/common/EmptyState.tsx`) |
| `frontend/src/components/ui/loading-skeleton.tsx` | Create | Three-variant loading skeleton (card, table, form) |
| `frontend/src/components/ui/error-boundary.tsx` | Create | React error boundary with class component internals |
| `frontend/src/components/common/EmptyState.tsx` | Delete | Superseded by `components/ui/empty-state.tsx` |
| `frontend/src/Design.md` | Modify | Replace content with redirect to spec |

**Test files:**
| File | Action |
|---|---|
| `frontend/src/components/ui/__tests__/page-shell.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/section-card.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/tab-bar.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/stat-card.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/empty-state.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/loading-skeleton.test.tsx` | Create |
| `frontend/src/components/ui/__tests__/error-boundary.test.tsx` | Create |

**Note on existing `components/common/EmptyState.tsx`:** The existing component has a different API (no `variant`, uses `actionLabel`/`onAction` instead of `action`). The new `<EmptyState>` in `components/ui/` supersedes it. After creating the new one, update all existing imports to use the new component, then delete the old file. The grep to find usages: `grep -r "common/EmptyState" frontend/src --include="*.tsx" -l`.

---

## Task 1: Token Layer — CSS

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add `--color-brand` token**

In `frontend/src/index.css`, inside `:root {}`, add after `--color-navy`:
```css
--color-brand: #b2db64; /* primary CTA green */
```

In the `@theme` block, add:
```css
--color-btn-primary: var(--color-brand);
```
(Keep `--color-btn-primary` in `@theme` as an alias during migration — it will be removed after all usages are replaced in Task 2.)

- [ ] **Step 2: Fix dark mode chart tokens**

In `frontend/src/index.css`, inside `.dark {}`, replace the five chart vars:
```css
--chart-1: oklch(0.75 0.18 145);
--chart-2: oklch(0.65 0.15 220);
--chart-3: oklch(0.60 0.12 30);
--chart-4: oklch(0.55 0.14 300);
--chart-5: oklch(0.50 0.13 0);
```

- [ ] **Step 3: Verify the CSS parses without errors**

Run: `cd frontend && npm run build 2>&1 | grep -i "error\|warning" | head -20`
Expected: no CSS parse errors. Build may fail on TypeScript — that's fine at this stage, focus on CSS errors only.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add --color-brand token and fix dark mode chart colors"
```

---

## Task 2: Migrate `--color-btn-primary` usages

**Files:**
- Modify: all files using `btn-primary` (found via grep)

- [ ] **Step 1: Find all usages**

Run: `grep -r "btn-primary\|color-btn-primary" frontend/src --include="*.tsx" --include="*.ts" --include="*.css" -n`

Note each file and line. Expected files include: `AppShell.tsx`, `EmployeeModal.tsx`, `IdleTimerModal.tsx`, `NewTaxTableModal.tsx`, `UploadTaxTableModal.tsx`, `EmptyState.tsx` (will be deleted), `EmployeeActions.tsx`, `SalaryStructurePanel.tsx`, `ConfirmModal.tsx`, and many pages.

- [ ] **Step 2: Replace all Tailwind class usages**

For each file: replace `bg-btn-primary` with `bg-brand`. Replace `text-btn-primary` with `text-brand` (if any). Replace `border-btn-primary` with `border-brand` (if any).

- [ ] **Step 3: Replace any CSS `var()` usages**

For any file using `var(--color-btn-primary)` in inline styles or CSS: replace with `var(--color-brand)`.

- [ ] **Step 4: Remove `--color-btn-primary` from `index.css`**

In `frontend/src/index.css`, remove `--color-btn-primary: #b2db64;` from `:root {}` and the `@theme` alias added in Task 1.

- [ ] **Step 5: Verify no remaining usages**

Run: `grep -r "btn-primary" frontend/src --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: no output.

- [ ] **Step 6: Build check**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: successful build or only TypeScript errors unrelated to CSS.

- [ ] **Step 7: Commit**

```bash
git add -p
git commit -m "feat: migrate btn-primary usages to color-brand token"
```

---

## Task 3: `<PageShell>` component

**Files:**
- Create: `frontend/src/components/ui/page-shell.tsx`
- Create: `frontend/src/components/ui/__tests__/page-shell.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/page-shell.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PageShell } from '../page-shell';

describe('PageShell', () => {
  it('renders title and subtitle', () => {
    render(<PageShell title="Employees" subtitle="Manage your workforce"><div /></PageShell>);
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.getByText('Manage your workforce')).toBeInTheDocument();
  });

  it('renders back button when onBack is provided', () => {
    const onBack = vi.fn();
    render(<PageShell title="Test" onBack={onBack}><div /></PageShell>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('does not render back button when onBack is omitted', () => {
    render(<PageShell title="Test"><div /></PageShell>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders actions slot', () => {
    render(
      <PageShell title="Test" actions={<button>Add</button>}><div /></PageShell>
    );
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<PageShell title="Test"><p>Content</p></PageShell>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/page-shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<PageShell>`**

Create `frontend/src/components/ui/page-shell.tsx`:
```tsx
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageShell({ title, subtitle, onBack, actions, children, className }: PageShellProps) {
  return (
    <div className={cn('max-w-3xl', className)}>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
              <ArrowLeft size={20} />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-navy">{title}</h1>
            {subtitle && <p className="text-slate-500 font-medium text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/page-shell.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/page-shell.tsx frontend/src/components/ui/__tests__/page-shell.test.tsx
git commit -m "feat: add PageShell primitive component"
```

---

## Task 4: `<SectionCard>` component

**Files:**
- Create: `frontend/src/components/ui/section-card.tsx`
- Create: `frontend/src/components/ui/__tests__/section-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/section-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { SectionCard } from '../section-card';

describe('SectionCard', () => {
  it('renders title in uppercase style', () => {
    render(<SectionCard title="Personal Details"><p>content</p></SectionCard>);
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<SectionCard title="Test"><p>inner content</p></SectionCard>);
    expect(screen.getByText('inner content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/section-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<SectionCard>`**

Create `frontend/src/components/ui/section-card.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, className }: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/section-card.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/section-card.tsx frontend/src/components/ui/__tests__/section-card.test.tsx
git commit -m "feat: add SectionCard primitive component"
```

---

## Task 5: `<TabBar>` component

**Files:**
- Create: `frontend/src/components/ui/tab-bar.tsx`
- Create: `frontend/src/components/ui/__tests__/tab-bar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/tab-bar.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../tab-bar';

const tabs = [
  { id: 'a', label: 'Tab A' },
  { id: 'b', label: 'Tab B' },
  { id: 'c', label: 'Tab C', hasError: true },
];

describe('TabBar', () => {
  it('renders all tab labels', () => {
    render(<TabBar tabs={tabs} active="a" onChange={() => {}} />);
    expect(screen.getByText('Tab A')).toBeInTheDocument();
    expect(screen.getByText('Tab B')).toBeInTheDocument();
    expect(screen.getByText('Tab C')).toBeInTheDocument();
  });

  it('marks active tab with aria-selected=true', () => {
    render(<TabBar tabs={tabs} active="b" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Tab B' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tab A' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with tab id when clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} active="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tab B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders tablist role on container', () => {
    render(<TabBar tabs={tabs} active="a" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/tab-bar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<TabBar>`**

Create `frontend/src/components/ui/tab-bar.tsx`:
```tsx
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  hasError?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
            active === tab.id
              ? 'bg-white text-navy shadow-sm'
              : 'text-slate-500 hover:text-navy',
            tab.hasError && 'after:ml-1 after:content-["•"] after:text-red-400',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/tab-bar.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/tab-bar.tsx frontend/src/components/ui/__tests__/tab-bar.test.tsx
git commit -m "feat: add TabBar primitive component"
```

---

## Task 6: `<StatCard>` component

**Files:**
- Create: `frontend/src/components/ui/stat-card.tsx`
- Create: `frontend/src/components/ui/__tests__/stat-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/stat-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { StatCard } from '../stat-card';
import { Users } from 'lucide-react';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Employees" value={142} />);
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('renders trend text', () => {
    render(<StatCard label="Test" value={10} trend="+3 this month" />);
    expect(screen.getByText('+3 this month')).toBeInTheDocument();
  });

  it('applies green color for trendDirection=up', () => {
    render(<StatCard label="Test" value={10} trend="+3" trendDirection="up" />);
    expect(screen.getByText('+3')).toHaveClass('text-green-600');
  });

  it('applies red color for trendDirection=down', () => {
    render(<StatCard label="Test" value={10} trend="-2" trendDirection="down" />);
    expect(screen.getByText('-2')).toHaveClass('text-red-500');
  });

  it('applies neutral color by default', () => {
    render(<StatCard label="Test" value={10} trend="no change" />);
    expect(screen.getByText('no change')).toHaveClass('text-slate-500');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/stat-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<StatCard>`**

Create `frontend/src/components/ui/stat-card.tsx`:
```tsx
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  className?: string;
}

const trendColors = {
  up: 'text-green-600',
  down: 'text-red-500',
  neutral: 'text-slate-500',
};

export function StatCard({ label, value, trend, trendDirection = 'neutral', icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
            {trend && (
              <p className={cn('mt-1 text-xs font-medium', trendColors[trendDirection])}>
                {trend}
              </p>
            )}
          </div>
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <Icon size={20} className="text-slate-500" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/stat-card.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/stat-card.tsx frontend/src/components/ui/__tests__/stat-card.test.tsx
git commit -m "feat: add StatCard primitive component"
```

---

## Task 7: `<EmptyState>` component

**Files:**
- Create: `frontend/src/components/ui/empty-state.tsx`
- Create: `frontend/src/components/ui/__tests__/empty-state.test.tsx`
- Delete: `frontend/src/components/common/EmptyState.tsx` (after migration)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/empty-state.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../empty-state';
import { Users } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState variant="no-data" title="No employees" description="Add one to get started." />);
    expect(screen.getByText('No employees')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
  });

  it('renders action button when action is provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        variant="no-data"
        title="No data"
        description="desc"
        action={{ label: 'Add Employee', onClick }}
      />
    );
    const btn = screen.getByRole('button', { name: 'Add Employee' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when action is omitted', () => {
    render(<EmptyState variant="no-data" title="No data" description="desc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses default icon for no-data variant', () => {
    const { container } = render(<EmptyState variant="no-data" title="No data" description="desc" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses provided icon over default', () => {
    render(<EmptyState variant="no-data" icon={Users} title="No users" description="desc" />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/empty-state.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<EmptyState>`**

Create `frontend/src/components/ui/empty-state.tsx`:
```tsx
import { Inbox, SearchX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

type EmptyStateVariant = 'no-data' | 'no-results' | 'error';

const defaultIcons: Record<EmptyStateVariant, LucideIcon> = {
  'no-data': Inbox,
  'no-results': SearchX,
  'error': AlertTriangle,
};

interface EmptyStateProps {
  variant: EmptyStateVariant;
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ variant, icon, title, description, action, className }: EmptyStateProps) {
  const Icon = icon ?? defaultIcons[variant];
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <Icon size={40} className="text-slate-300 dark:text-slate-600 mb-4" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">{description}</p>
      {action && (
        <Button variant="default" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/empty-state.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Migrate existing usages of `common/EmptyState`**

Run: `grep -r "common/EmptyState" frontend/src --include="*.tsx" -l`

For each file found, update the import from:
```tsx
import { EmptyState } from '@/components/common/EmptyState';
```
to:
```tsx
import { EmptyState } from '@/components/ui/empty-state';
```

Also update the props API:
- Old: `icon={X} title="..." description="..." actionLabel="..." onAction={fn}`
- New: `variant="no-data" icon={X} title="..." description="..." action={{ label: '...', onClick: fn }}`

- [ ] **Step 6: Delete old EmptyState**

```bash
rm frontend/src/components/common/EmptyState.tsx
```

Verify no remaining imports: `grep -r "common/EmptyState" frontend/src`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/empty-state.tsx frontend/src/components/ui/__tests__/empty-state.test.tsx
git add frontend/src/components/common/EmptyState.tsx  # deleted
git add -p  # stage migrated files
git commit -m "feat: add EmptyState to ui/, migrate from common/EmptyState"
```

---

## Task 8: `<LoadingSkeleton>` component

**Files:**
- Create: `frontend/src/components/ui/loading-skeleton.tsx`
- Create: `frontend/src/components/ui/__tests__/loading-skeleton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/loading-skeleton.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import { LoadingSkeleton } from '../loading-skeleton';

describe('LoadingSkeleton', () => {
  it('renders card variant', () => {
    const { container } = render(<LoadingSkeleton variant="card" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders table variant with default 5 rows', () => {
    const { container } = render(<LoadingSkeleton variant="table" />);
    const rows = container.querySelectorAll('[data-testid="skeleton-row"]');
    expect(rows).toHaveLength(5);
  });

  it('renders table variant with custom rows', () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={3} />);
    const rows = container.querySelectorAll('[data-testid="skeleton-row"]');
    expect(rows).toHaveLength(3);
  });

  it('renders form variant', () => {
    const { container } = render(<LoadingSkeleton variant="form" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/loading-skeleton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<LoadingSkeleton>`**

Create `frontend/src/components/ui/loading-skeleton.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface LoadingSkeletonProps {
  variant: 'card' | 'table' | 'form';
  rows?: number;
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} data-testid="skeleton-row" className="flex gap-4 items-center py-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ variant, rows = 5 }: LoadingSkeletonProps) {
  if (variant === 'card') return <CardSkeleton />;
  if (variant === 'table') return <TableSkeleton rows={rows} />;
  return <FormSkeleton />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/loading-skeleton.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/loading-skeleton.tsx frontend/src/components/ui/__tests__/loading-skeleton.test.tsx
git commit -m "feat: add LoadingSkeleton primitive component"
```

---

## Task 9: `<ErrorBoundary>` component

**Files:**
- Create: `frontend/src/components/ui/error-boundary.tsx`
- Create: `frontend/src/components/ui/__tests__/error-boundary.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/__tests__/error-boundary.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../error-boundary';

// Suppress React's error output in tests
const consoleError = console.error;
beforeAll(() => { console.error = vi.fn(); });
afterAll(() => { console.error = consoleError; });

function BrokenComponent(): never {
  throw new Error('Test render error');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><p>Safe content</p></ErrorBoundary>);
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders default error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>Custom error</p>}>
        <BrokenComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/error-boundary.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `<ErrorBoundary>`**

Create `frontend/src/components/ui/error-boundary.tsx`:
```tsx
import { Component } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            An unexpected error occurred. Please refresh the page or try again.
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  return <ErrorBoundaryClass fallback={fallback}>{children}</ErrorBoundaryClass>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/error-boundary.test.tsx`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/error-boundary.tsx frontend/src/components/ui/__tests__/error-boundary.test.tsx
git commit -m "feat: add ErrorBoundary primitive component"
```

---

## Task 10: Full test suite and Design.md redirect

**Files:**
- Modify: `frontend/src/Design.md`

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/`
Expected: all tests PASS. Fix any failures before proceeding.

- [ ] **Step 2: Update Design.md**

Replace the entire content of `frontend/src/Design.md` with:
```markdown
# Design System

The canonical design system spec lives at:
[docs/superpowers/specs/2026-05-03-design-system-design.md](/docs/superpowers/specs/2026-05-03-design-system-design.md)
```

- [ ] **Step 3: Final build check**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/Design.md
git commit -m "docs: redirect Design.md to canonical design system spec"
```

---

## Acceptance Criteria

- [ ] `--color-brand` token exists in `index.css`; `--color-btn-primary` is gone
- [ ] Dark mode chart vars (`--chart-1` through `--chart-5`) have distinct values in `.dark {}`
- [ ] `grep -r "btn-primary" frontend/src` returns no results
- [ ] All 7 new components exist in `frontend/src/components/ui/`
- [ ] All component tests pass: `cd frontend && npx vitest run src/components/ui/__tests__/`
- [ ] `frontend/src/components/common/EmptyState.tsx` is deleted
- [ ] `frontend/src/Design.md` contains only the redirect
- [ ] `cd frontend && npm run build` succeeds
