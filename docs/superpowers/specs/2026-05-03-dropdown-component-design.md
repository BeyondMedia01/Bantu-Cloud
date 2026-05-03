# Dropdown Component Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all inline dropdown menus across the platform with a single shared `<Dropdown>` component that matches the sidebar company selector's visual style and behavior.

**Architecture:** A custom uncontrolled React component in `components/ui/dropdown.tsx`. It owns open/close state internally, positions its panel absolutely below the trigger, and closes on outside click or Escape. The trigger is a flexible render prop so callers control their own button styling. The AppShell company selector is the visual reference but is not migrated — it has sidebar-specific layout concerns (footer link, full-width, docked position).

**Scope:** Replaces three existing inline dropdowns: Payroll.tsx (Bank file format), PayrollSummary.tsx (Bank file format), PayrollInputGrid.tsx (column picker). All future dropdown menus use this component.

---

## Component API

**File:** `frontend/src/components/ui/dropdown.tsx`

```tsx
interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface DropdownSection {
  heading?: string;        // optional non-clickable label above items
  items: DropdownItem[];
}

interface DropdownProps {
  trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  sections: DropdownSection[];   // one section = flat list; multiple = labeled groups
  align?: 'left' | 'right';     // panel alignment relative to trigger, default 'left'
  footer?: React.ReactNode;      // optional footer slot (e.g. "+ Add" link)
  className?: string;            // forwarded to the panel container
}
```

**Usage — simple flat list:**
```tsx
<Dropdown
  align="right"
  trigger={(isOpen) => (
    <button className="flex items-center gap-1.5 ...">
      Bank <ChevronDown size={10} className={isOpen ? 'rotate-180' : ''} />
    </button>
  )}
  sections={[{
    items: [
      { label: 'CBZ', onClick: () => handleBankExport('cbz') },
      { label: 'Stanbic', onClick: () => handleBankExport('stanbic') },
      { label: 'Fidelity', onClick: () => handleBankExport('fidelity') },
    ]
  }]}
/>
```

**Usage — sectioned list with heading:**
```tsx
<Dropdown
  trigger={<button>+ Add</button>}
  sections={[{
    heading: 'Add Column',
    items: availableCodes.map(tc => ({
      label: tc.code,
      icon: <Badge type={tc.type} />,
      onClick: () => addColumn(tc),
    }))
  }]}
/>
```

---

## Behavior

- **Open/close:** Uncontrolled — component manages `isOpen` state internally via `useState`.
- **Trigger:** Accepts `React.ReactNode` or `(isOpen: boolean) => React.ReactNode`. When a function, receives current open state so callers can rotate a chevron or change styling.
- **Close triggers:** Clicking outside (mousedown listener on `document`), pressing Escape, or clicking any item.
- **Keyboard:** Escape closes. No arrow-key navigation (YAGNI).
- **Positioning:** Panel uses `absolute top-full mt-1` with `align="right"` → `right-0`, `align="left"` → `left-0`. Wrapper div is `relative`.
- **Scrollable panel:** Panel has `max-h-60 overflow-y-auto` to handle long lists (column picker case).

---

## Visual Style

Matches the sidebar company selector:

```
Panel:    bg-white border border-border rounded-xl shadow-lg z-20 min-w-[140px] py-1
Heading:  px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest
Item:     w-full text-left px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2
Footer:   border-t border-border mt-1 pt-1
```

---

## Migration Targets

| File | Current pattern | After |
|------|----------------|-------|
| `pages/Payroll.tsx` | `bankDropdown: string \| null` state + inline div | `<Dropdown>` per row, remove state + refs + useEffects |
| `pages/PayrollSummary.tsx` | `bankDropdown: boolean` state + inline div | `<Dropdown>`, remove state |
| `pages/PayrollInputGrid.tsx` | `showColPicker: boolean` + inline div | `<Dropdown>` with section heading and custom item rendering |

**Not migrated:** `AppShell.tsx` company selector — sidebar-specific layout (full-width trigger, footer link, docked position). It remains the visual reference.

**Not in scope:** `Leave.tsx` employee search — this is a combobox (typed search + filtered results), a distinct interaction pattern with different accessibility requirements. Separate component, separate task.

---

## Files

- **Create:** `frontend/src/components/ui/dropdown.tsx`
- **Create:** `frontend/src/components/ui/dropdown.test.tsx`
- **Modify:** `frontend/src/pages/Payroll.tsx`
- **Modify:** `frontend/src/pages/PayrollSummary.tsx`
- **Modify:** `frontend/src/pages/PayrollInputGrid.tsx`
