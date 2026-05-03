# Dropdown Component Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all inline dropdown menus across the platform with a single shared `<Dropdown>` component that matches the sidebar company selector's visual style and behavior.

**Architecture:** A custom uncontrolled React component in `components/ui/dropdown.tsx`. It owns open/close state internally. The trigger is a flexible render prop so callers control their own button styling. The AppShell company selector is the visual reference but is not migrated — it has sidebar-specific layout concerns.

**Scope:** Replaces three existing inline dropdowns: Payroll.tsx (Bank file format), PayrollSummary.tsx (Bank file format), PayrollInputGrid.tsx (column picker). All future dropdown menus use this component.

---

## Component API

**File:** `frontend/src/components/ui/dropdown.tsx`

```tsx
interface DropdownItem {
  label?: string;               // required when renderItem is absent; ignored when renderItem is provided
  onClick: () => void;
  icon?: React.ReactNode;       // rendered before label; ignored when renderItem is provided
  renderItem?: () => React.ReactNode;  // overrides label+icon entirely; when provided, label and icon are ignored
  disabled?: boolean;
}

interface DropdownSection {
  heading?: string;             // optional non-clickable label above items
  items: DropdownItem[];
  emptyMessage?: string;        // shown when items is empty; if omitted, panel suppresses render
}

interface DropdownProps {
  trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  sections: DropdownSection[];
  align?: 'left' | 'right';    // panel alignment, default 'left'
  disabled?: boolean;           // prevents opening entirely; callers use this when trigger is disabled
  stopPropagation?: boolean;    // calls e.stopPropagation() on the wrapper click, default false
  className?: string;           // forwarded to the panel container
}
```

**Usage — bank format (Payroll row):**
```tsx
<Dropdown
  align="right"
  stopPropagation        // row is a navigation target
  trigger={(isOpen) => (
    <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100">
      <Banknote size={12} /> Bank <ChevronDown size={10} className={isOpen ? 'rotate-180' : ''} />
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

**Usage — column picker (PayrollInputGrid):**
```tsx
<Dropdown
  trigger={<button className="flex items-center gap-1 text-xs font-bold text-accent-blue"><Plus size={12} /> Add</button>}
  sections={[{
    heading: 'Add Column',
    emptyMessage: 'All codes are already columns',
    items: available.map((tc) => ({
      renderItem: () => (
        <>
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${typeClass(tc.type)}`}>
            {tc.type.slice(0, 3)}
          </span>
          <span className="font-medium">{tc.code}</span>
          <span className="text-slate-400 text-xs">{tc.name}</span>
        </>
      ),
      onClick: () => addColumn(tc),
    }))
  }]}
/>
```

---

## Behavior

- **Open/close:** Uncontrolled — component manages `isOpen` via `useState`. Because each usage is its own instance, multiple rows in a table each have an independent dropdown. Only one is ever realistically open at a time (clicking outside closes the current one before another could open). The mutual-exclusion of the previous `bankDropdown: string | null` pattern is intentionally dropped — it was over-engineered for this use case.
- **Trigger:** `React.ReactNode | ((isOpen: boolean) => React.ReactNode)`. Function form receives current open state for chevron rotation or styling.
- **Disabled:** When `disabled` prop is true, the wrapper ignores all click events and the panel never opens. Callers set this when their trigger button would be disabled (e.g. `disabled={!!exporting}`).
- **Stop propagation:** When `stopPropagation` is set, the wrapper calls `e.stopPropagation()` on every click event that reaches it — including item clicks bubbling up — so no additional `stopPropagation` is needed inside item `onClick` handlers.
- **Close triggers:** Click outside (mousedown on `document`), Escape key, clicking any item.
- **Empty sections:** If a section has an empty `items` array and no `emptyMessage`, the panel does not render at all (suppresses open). If `emptyMessage` is provided, it renders as a non-clickable row.
- **Keyboard:** Escape closes. No arrow-key navigation (YAGNI).
- **Positioning:** `absolute top-full mt-1`, `right-0` when `align="right"`, `left-0` when `align="left"`. Wrapper is `relative`.
- **Z-index:** `z-30` on all panels (resolves stacking conflicts between Payroll and PayrollInputGrid on the same page).

---

## Visual Style

Matches the sidebar company selector:

```
Panel:    bg-white border border-border rounded-xl shadow-lg z-30 min-w-[110px] max-h-60 overflow-y-auto py-1
Heading:  px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest
Item:     w-full text-left px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 uppercase disabled:opacity-50 disabled:cursor-not-allowed
Empty:    px-3 py-2 text-xs text-slate-400
```

Item text is `text-xs font-bold uppercase` — matching the existing bank format buttons rather than the sidebar's `text-sm font-semibold`. This preserves visual parity with the current dropdowns. The sidebar uses a larger style because it lives in a wider context (full sidebar width); these dropdowns are compact table/page actions.

---

## Migration Targets

| File | Current pattern | Removes |
|------|----------------|---------|
| `pages/Payroll.tsx` | `bankDropdown: string \| null`, `bankDropdownRef`, two `useEffect`s, inline div | All of the above; replace with `<Dropdown stopPropagation align="right">` per row |
| `pages/PayrollSummary.tsx` | `bankDropdown: boolean`, inline div | State + inline div; replace with `<Dropdown align="right">` |
| `pages/PayrollInputGrid.tsx` | `showColPicker: boolean`, inline div in `<th>` | State + inline div; replace with `<Dropdown>` with `renderItem` and `emptyMessage` |

**Not migrated:** `AppShell.tsx` company selector — sidebar-specific layout. Visual reference only.

**Not in scope:** `Leave.tsx` employee search — combobox pattern, separate component, separate task.

---

## Files

- **Create:** `frontend/src/components/ui/dropdown.tsx`
- **Create:** `frontend/src/components/ui/dropdown.test.tsx`
- **Modify:** `frontend/src/pages/Payroll.tsx`
- **Modify:** `frontend/src/pages/PayrollSummary.tsx`
- **Modify:** `frontend/src/pages/PayrollInputGrid.tsx`
