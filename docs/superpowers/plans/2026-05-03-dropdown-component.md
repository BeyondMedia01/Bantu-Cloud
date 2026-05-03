# Dropdown Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `<Dropdown>` component and migrate three existing inline dropdown menus to use it.

**Architecture:** Custom uncontrolled React component in `components/ui/dropdown.tsx`. Manages open/close state internally. Trigger is a render prop (function or ReactNode). Panel positions absolutely below the trigger, closes on outside click or Escape. Three migration targets replace their inline dropdown state and JSX with `<Dropdown>`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, `@testing-library/jest-dom`, `@testing-library/user-event`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/ui/dropdown.tsx` | Create | The `<Dropdown>` component |
| `frontend/src/components/ui/dropdown.test.tsx` | Create | RTL tests for `<Dropdown>` |
| `frontend/src/pages/Payroll.tsx` | Modify | Replace inline bank dropdown |
| `frontend/src/pages/PayrollSummary.tsx` | Modify | Replace inline bank dropdown |
| `frontend/src/pages/PayrollInputGrid.tsx` | Modify | Replace inline column picker |

---

## Task 1: Build the `<Dropdown>` component (TDD)

**Files:**
- Create: `frontend/src/components/ui/dropdown.tsx`
- Create: `frontend/src/components/ui/dropdown.test.tsx`

### Step 1: Install `@testing-library/user-event` if not present

- [ ] Run:
```bash
cd frontend && npm list @testing-library/user-event 2>/dev/null | grep user-event || npm install --save-dev @testing-library/user-event
```

### Step 2: Write the failing tests

- [ ] Create `frontend/src/components/ui/dropdown.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from './dropdown';

const basicSections = [{
  items: [
    { label: 'CBZ', onClick: vi.fn() },
    { label: 'Stanbic', onClick: vi.fn() },
  ],
}];

describe('Dropdown', () => {
  it('does not show panel on initial render', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows panel when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('CBZ')).toBeInTheDocument();
    expect(screen.getByText('Stanbic')).toBeInTheDocument();
  });

  it('closes when an item is clicked and calls onClick', async () => {
    const user = userEvent.setup();
    const onCbz = vi.fn();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [{ label: 'CBZ', onClick: onCbz }] }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByText('CBZ'));
    expect(onCbz).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Dropdown trigger={<button>Open</button>} sections={basicSections} />
        <button>Outside</button>
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders section heading when provided', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ heading: 'Choose Bank', items: [{ label: 'CBZ', onClick: vi.fn() }] }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Choose Bank')).toBeInTheDocument();
  });

  it('renders emptyMessage when items array is empty', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [], emptyMessage: 'Nothing here' }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('does not open panel when all sections are empty and no emptyMessage', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [] }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} disabled />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('passes isOpen to trigger function', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        trigger={(isOpen) => <button>{isOpen ? 'Close' : 'Open'}</button>}
        sections={basicSections}
      />
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders custom renderItem instead of label', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{
          items: [{
            renderItem: () => <span data-testid="custom">Custom</span>,
            onClick: vi.fn(),
          }],
        }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('aligns panel to the right when align="right"', async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} align="right" />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/right-0/);
  });

  it('aligns panel to the left by default', async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Open</button>} sections={basicSections} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/left-0/);
  });

  it('stops propagation on wrapper click when stopPropagation is set', async () => {
    const user = userEvent.setup();
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <Dropdown stopPropagation trigger={<button>Open</button>} sections={basicSections} />
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
```

### Step 3: Run tests to confirm they all fail

- [ ] Run:
```bash
cd frontend && npx vitest run src/components/ui/dropdown.test.tsx 2>&1 | tail -20
```
Expected: All tests fail with "Cannot find module './dropdown'" or similar.

### Step 4: Implement the component

- [ ] Create `frontend/src/components/ui/dropdown.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  label?: string;
  onClick: () => void;
  icon?: React.ReactNode;
  renderItem?: () => React.ReactNode;
  disabled?: boolean;
}

export interface DropdownSection {
  heading?: string;
  items: DropdownItem[];
  emptyMessage?: string;
}

export interface DropdownProps {
  trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  sections: DropdownSection[];
  align?: 'left' | 'right';
  disabled?: boolean;
  stopPropagation?: boolean;
  className?: string;
}

export function Dropdown({
  trigger,
  sections,
  align = 'left',
  disabled = false,
  stopPropagation = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Suppress open when all sections are empty with no emptyMessage
  const hasContent = sections.some(
    (s) => s.items.length > 0 || s.emptyMessage !== undefined
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [isOpen]);

  const handleWrapperClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (disabled || !hasContent) return;
    setIsOpen((v) => !v);
  };

  const handleItemClick = (item: DropdownItem) => {
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative" onClick={handleWrapperClick}>
      {typeof trigger === 'function' ? trigger(isOpen) : trigger}
      {isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-30',
            'min-w-[110px] max-h-60 overflow-y-auto py-1',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {sections.map((section, si) => (
            <div key={si}>
              {section.heading && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {section.heading}
                </p>
              )}
              {section.items.length === 0 && section.emptyMessage ? (
                <p className="px-3 py-2 text-xs text-slate-400">{section.emptyMessage}</p>
              ) : (
                section.items.map((item, ii) => (
                  <button
                    key={ii}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left px-3 py-1.5 text-xs font-bold text-slate-600 uppercase hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {item.renderItem ? item.renderItem() : (
                      <>
                        {item.icon}
                        {item.label}
                      </>
                    )}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 5: Run tests — expect all to pass

- [ ] Run:
```bash
cd frontend && npx vitest run src/components/ui/dropdown.test.tsx 2>&1 | tail -20
```
Expected: All 14 tests pass, 0 failures.

### Step 6: Build check

- [ ] Run:
```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs` with no errors.

### Step 7: Commit

- [ ] Run:
```bash
cd frontend && git add src/components/ui/dropdown.tsx src/components/ui/dropdown.test.tsx && git commit -m "feat: add Dropdown component with tests"
```

---

## Task 2: Migrate Payroll.tsx bank dropdown

**Files:**
- Modify: `frontend/src/pages/Payroll.tsx`

The current implementation uses `bankDropdown: string | null` state, a `bankDropdownRef`, and two `useEffect`s (Escape key + click outside) for the bank format dropdown. Replace with `<Dropdown stopPropagation align="right">`.

### Step 1: Open `frontend/src/pages/Payroll.tsx` and make these changes

- [ ] Add `Dropdown` import (near top, with other component imports):
```tsx
import { Dropdown } from '../components/ui/dropdown';
```

- [ ] Remove these lines from state/refs (lines ~17-18):
```tsx
const [bankDropdown, setBankDropdown] = useState<string | null>(null);
const bankDropdownRef = useRef<HTMLDivElement>(null);
```

- [ ] Remove these two `useEffect` blocks (lines ~34-50):
```tsx
// Close bank dropdown on Escape key or click outside
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBankDropdown(null); };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, []);

useEffect(() => {
  if (!bankDropdown) return;
  const onOutside = (e: MouseEvent) => {
    if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
      setBankDropdown(null);
    }
  };
  document.addEventListener('mousedown', onOutside);
  return () => document.removeEventListener('mousedown', onOutside);
}, [bankDropdown]);
```

- [ ] In `handleBankExport`, remove both `e.stopPropagation()` (line ~86) and `setBankDropdown(null)` (line ~87). Also update the function signature from `(e: React.MouseEvent, format, runId)` to `(format, runId)` — the event parameter is no longer needed.

- [ ] Also remove unused imports: `useRef` (if no longer used elsewhere — check first), `ChevronDown` (check if used elsewhere).

- [ ] Replace the inline bank dropdown JSX block (lines ~305-327):

Replace this:
```tsx
{/* Bank file dropdown */}
<div ref={bankDropdownRef} className="relative" onClick={(e) => e.stopPropagation()}>
  <button
    onClick={() => setBankDropdown(bankDropdown === run.id ? null : run.id)}
    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100"
    title="Download Bank Payment File"
  >
    <Banknote size={12} /> Bank <ChevronDown size={10} />
  </button>
  {bankDropdown === run.id && (
    <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 min-w-[110px] py-1">
      {(['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => (
        <button
          key={fmt}
          onClick={(e) => handleBankExport(e, fmt, run.id)}
          className="w-full text-left px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 uppercase"
        >
          {fmt}
        </button>
      ))}
    </div>
  )}
</div>
```

With this:
```tsx
<Dropdown
  stopPropagation
  align="right"
  trigger={(isOpen) => (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100"
      title="Download Bank Payment File"
    >
      <Banknote size={12} /> Bank <ChevronDown size={10} className={isOpen ? 'rotate-180' : ''} />
    </button>
  )}
  sections={[{
    items: (['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => ({
      label: fmt,
      onClick: () => handleBankExport(fmt, run.id),
    })),
  }]}
/>
```


### Step 2: Build to catch TypeScript errors

- [ ] Run:
```bash
cd frontend && npm run build 2>&1 | grep -E 'error|✓'
```
Expected: `✓ built in X.XXs`

### Step 3: Commit

- [ ] Run:
```bash
cd frontend && git add src/pages/Payroll.tsx && git commit -m "refactor: migrate Payroll bank dropdown to <Dropdown>"
```

---

## Task 3: Migrate PayrollSummary.tsx bank dropdown

**Files:**
- Modify: `frontend/src/pages/PayrollSummary.tsx`

The current implementation uses `bankDropdown: boolean` state with no click-outside detection.

### Step 1: Open `frontend/src/pages/PayrollSummary.tsx` and make these changes

- [ ] Add `Dropdown` import:
```tsx
import { Dropdown } from '../components/ui/dropdown';
```

- [ ] Remove `bankDropdown` state (line ~17):
```tsx
const [bankDropdown, setBankDropdown] = useState(false);
```

- [ ] Remove `setBankDropdown(false)` from `handleBankExport` (line ~106).

- [ ] Remove unused imports if applicable: `ChevronDown` (check first).

- [ ] Replace the inline bank dropdown JSX (lines ~269-290):

Replace this:
```tsx
<div className="relative">
  <button
    onClick={() => setBankDropdown(!bankDropdown)}
    disabled={!!exporting}
    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-bold hover:bg-emerald-100 disabled:opacity-50"
  >
    <Banknote size={14} /> Bank <ChevronDown size={12} />
  </button>
  {bankDropdown && (
    <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 min-w-[110px] py-1">
      {(['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => (
        <button
          key={fmt}
          onClick={() => handleBankExport(fmt)}
          className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 uppercase"
        >
          {fmt}
        </button>
      ))}
    </div>
  )}
</div>
```

With this:
```tsx
<Dropdown
  align="right"
  disabled={!!exporting}
  trigger={(isOpen) => (
    <button
      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-bold hover:bg-emerald-100 disabled:opacity-50"
    >
      <Banknote size={14} /> Bank <ChevronDown size={12} className={isOpen ? 'rotate-180' : ''} />
    </button>
  )}
  sections={[{
    items: (['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => ({
      label: fmt,
      onClick: () => handleBankExport(fmt),
    })),
  }]}
/>
```

### Step 2: Build check

- [ ] Run:
```bash
cd frontend && npm run build 2>&1 | grep -E 'error|✓'
```
Expected: `✓ built in X.XXs`

### Step 3: Commit

- [ ] Run:
```bash
cd frontend && git add src/pages/PayrollSummary.tsx && git commit -m "refactor: migrate PayrollSummary bank dropdown to <Dropdown>"
```

---

## Task 4: Migrate PayrollInputGrid.tsx column picker

**Files:**
- Modify: `frontend/src/pages/PayrollInputGrid.tsx`

The current implementation uses `showColPicker: boolean` state with a rich custom item layout (type badge + code + name).

### Step 1: Open `frontend/src/pages/PayrollInputGrid.tsx` and make these changes

- [ ] Add `Dropdown` import:
```tsx
import { Dropdown } from '../components/ui/dropdown';
```

- [ ] Remove `showColPicker` state (line ~109):
```tsx
const [showColPicker, setShowColPicker] = useState(false);
```

- [ ] Remove `setShowColPicker(false)` from `addColumn` (line ~248).

- [ ] Replace the inline column picker JSX in the `<th>` (lines ~540-577):

Replace this:
```tsx
<th className="px-3 py-3 min-w-[60px] relative">
  <button
    onClick={() => setShowColPicker((v) => !v)}
    className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:text-navy whitespace-nowrap"
  >
    <Plus size={12} /> Add
  </button>
  {showColPicker && (
    <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Add Column</p>
      </div>
      {available.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-400">All codes are already columns</p>
      ) : (
        available.map((tc) => (
          <button
            key={tc.id}
            onClick={() => addColumn(tc)}
            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm flex items-center gap-2"
          >
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
              tc.type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' :
              tc.type === 'DEDUCTION' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {tc.type.slice(0, 3)}
            </span>
            <span className="font-medium">{tc.code}</span>
            <span className="text-slate-400 text-xs">{tc.name}</span>
          </button>
        ))
      )}
    </div>
  )}
</th>
```

With this:
```tsx
<th className="px-3 py-3 min-w-[60px] relative">
  <Dropdown
    trigger={
      <button className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:text-navy whitespace-nowrap">
        <Plus size={12} /> Add
      </button>
    }
    sections={[{
      heading: 'Add Column',
      emptyMessage: 'All codes are already columns',
      items: available.map((tc) => ({
        onClick: () => addColumn(tc),
        renderItem: () => (
          <>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
              tc.type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' :
              tc.type === 'DEDUCTION' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {tc.type.slice(0, 3)}
            </span>
            <span className="font-medium text-xs normal-case">{tc.code}</span>
            <span className="text-slate-400 text-xs normal-case">{tc.name}</span>
          </>
        ),
      })),
    }]}
    className="w-64"
  />
</th>
```

**Note:** The column picker items use `normal-case` to override the component's default `uppercase` class, since code and name should not be uppercased.

### Step 2: Build check

- [ ] Run:
```bash
cd frontend && npm run build 2>&1 | grep -E 'error|✓'
```
Expected: `✓ built in X.XXs`

### Step 3: Run all tests

- [ ] Run:
```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: All tests pass.

### Step 4: Commit

- [ ] Run:
```bash
cd frontend && git add src/pages/PayrollInputGrid.tsx && git commit -m "refactor: migrate PayrollInputGrid column picker to <Dropdown>"
```

---

## Task 5: Push

- [ ] Run:
```bash
git push origin main
```
