# Modules & Sidebar Design

## The 15 Business Modules

| # | Module | Tier | Description |
|---|--------|------|-------------|
| 1 | PEOPLE | 1 | Employee master data, org hierarchy, grades, documents |
| 2 | TIME_LEAVE | 1 | Leave policies, requests, accruals; biometric attendance, OT |
| 3 | PAYROLL | 1 | Payroll runs, payslips, transaction codes, loans, back pay |
| 4 | COMPLIANCE | 1 | ZIMRA IT7/P2, NSSA P4A, tax tables, directives |
| 5 | REPORTS | 1 | 20+ report types, CSV/PDF/HTML/XLSX exports |
| 6 | SETTINGS | 1 | System config, currency rates, holidays, defaults |
| 7 | RECRUITMENT | 2 | Job postings, applications, interview scheduling |
| 8 | PERFORMANCE | 2 | Appraisals, KPIs, manager reviews |
| 9 | EXPENSES | 2 | Claims, approval workflow, payroll integration |
| 10 | ONBOARDING | 3 | Task checklists, document collection, equipment |
| 11 | TRAINING | 3 | Courses, certifications, skills matrix |
| 12 | ASSETS | 3 | Asset assignment, depreciation |
| 13 | SUCCESSION | 4 | Career paths, talent pool |
| 14 | SURVEYS | 4 | Engagement surveys, exit interviews |
| 15 | ANALYTICS | 4 | Headcount forecasting, turnover BI |

## The 7 Actions Per Module

`VIEW`, `EDIT`, `DELETE`, `APPROVE`, `EXPORT`, `RUN`, `CONFIGURE`

## 3-Layer Access Filtering

```
JWT from server
  │
  ├── Layer 1: Module Licensing (client subscription)
  │     └── enabledModules in JWT → controls which modules are paid for
  │
  ├── Layer 2: System Role Bypass
  │     ├── PLATFORM_ADMIN  → sees everything (no permission checks)
  │     ├── CLIENT_ADMIN    → sees all enabledModules (no permission checks)
  │     └── COMPANY_USER   → must pass Layer 3
  │
  └── Layer 3: Granular Permissions (COMPANY_USER only)
        └── permissions[MODULE] = ['VIEW', 'EDIT', ...]
              └── sidebar items filtered by `can(module)` check
```

## Sidebar Structure (AppShell.tsx)

The sidebar has **3 layout modes** depending on user role:

### Platform Admin — Flat Link List

```
┌──────────────────────────────┐
│  Bantu                    [<]│
├──────────────────────────────┤
│  Dashboard                  │
│  Users                      │
│  Clients                    │
│  Licenses                   │
│  Settings                   │
├──────────────────────────────┤
│  Avatar  Admin           [⏻]│
└──────────────────────────────┘
```
Direct links. No module filtering (all-access).

### Employee Self-Service — Flat Link List

```
┌──────────────────────────────┐
│  Bantu                    [<]│
├──────────────────────────────┤
│  Dashboard                  │
│  Payslips                   │
│  Leave                      │
│  Attendance                 │
│  Documents                  │
│  Profile                    │
├──────────────────────────────┤
│  Avatar  Employee        [⏻]│
└──────────────────────────────┘
```
Personal pages only. No module filtering.

### Company User (CLIENT_ADMIN / COMPANY_USER) — Grouped + Module-Filtered

```
┌──────────────────────────────┐
│  Bantu                    [<]│
├──────────────────────────────┤
│  Active Company              │
│  ┌────────────────────────┐ │
│  │  Acme (Pvt) Ltd     ▼  │ │
│  └────────────────────────┘ │
├──────────────────────────────┤
│  Dashboard                   │
│                              │
│  ▼ People                    │
│    Employees                 │
│    Grades                    │
│    Company Structure         │
│                              │
│  ▼ Time & Leave              │
│    Leave                     │
│    Shifts & Roster           │
│    Attendance                │
│                              │
│  ▼ Payroll & Finance          │
│    Payroll                   │
│    Payslip Input             │
│    Loans                     │
│                              │
│  ▼ Insights                  │
│    Reports                   │
│                              │
│  ▼ Settings                  │
│    Utilities                 │
│    Settings                  │
├──────────────────────────────┤
│  ADMINISTRATION              │
│  Companies                   │
│  Roles                       │
│  Team Members                │
│  Subscription                │
├──────────────────────────────┤
│  Avatar  John Doe        [⏻]│
└──────────────────────────────┘
```

**Filtering logic** (in `AppShell.tsx:208-212`):
```typescript
const visibleGroups = allGroups.map(group => ({
  ...group,
  items: group.items.filter(item => !item.module || can(item.module)),
})).filter(group => group.items.length > 0);
```

Each nav item declares its module. If the user lacks access to that module, the item is hidden. Groups with zero visible items are removed entirely.

**Admin section** only shows for CLIENT_ADMIN role (`AppShell.tsx:247-252`):
```typescript
const adminSectionLinks = user?.role === 'CLIENT_ADMIN' ? [
  { to: '/companies', label: 'Companies' },
  { to: '/client-admin/roles', label: 'Roles' },
  { to: '/client-admin/users', label: 'Team Members' },
  { to: '/subscription', label: 'Subscription' },
] : [];
```

## Nav Group Definitions

| Group | Key | Items |
|-------|-----|-------|
| People | `people` | Employees, Grades, Company Structure, Recruitment, Onboarding, Succession |
| Time & Leave | `time` | Leave, Shifts & Roster, Attendance |
| Payroll & Finance | `payroll` | Payroll, Payslip Input, Loans, Expenses, Assets |
| Performance | `performance` | Performance, Training, Surveys |
| Insights | `insights` | Reports, Analytics |
| Settings | `settings` | Utilities, Settings |

Each group is collapsible (open/closed state persisted in `localStorage`). The group containing the active route auto-expands on navigation.

## The `usePermissions()` Hook

```typescript
// frontend/src/hooks/usePermissions.ts
function usePermissions() {
  const user = getUser();    // Decoded JWT payload

  const can = (module, action?) => {
    if (!isModuleLicensed(module)) return false;   // Layer 1
    if (isClientAdmin) return true;                // Layer 2 (bypass)
    if (!action) return canAccessModule(module);   // Layer 3a: any action
    return permissions[module]?.includes(action);  // Layer 3b: specific action
  };

  return { can, isClientAdmin };
}
```

## Key Types

```typescript
// frontend/src/lib/auth.ts
type AppModule =
  | 'PEOPLE' | 'TIME_LEAVE' | 'PAYROLL' | 'COMPLIANCE' | 'REPORTS' | 'SETTINGS'
  | 'RECRUITMENT' | 'PERFORMANCE' | 'EXPENSES'
  | 'ONBOARDING' | 'TRAINING' | 'ASSETS'
  | 'SUCCESSION' | 'SURVEYS' | 'ANALYTICS';

type ModuleAction = 'VIEW' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'RUN' | 'CONFIGURE';
type ModulePermissions = Partial<Record<AppModule, ModuleAction[]>>;
```

## Collapsed Mode

The sidebar collapses to 64px (`w-16`), showing only group icons. Clicking a group icon expands the sidebar + navigates to the group's first item. State persisted in `localStorage.getItem('sidebarCollapsed')`.

## Key Files

| File | Role |
|------|------|
| `frontend/src/components/AppShell.tsx` | Sidebar layout, nav groups, filtering, company switcher, mobile drawer |
| `frontend/src/hooks/usePermissions.ts` | `can()` function enforcing licensing + role + permission checks |
| `frontend/src/lib/auth.ts` | `AppModule` / `ModuleAction` type definitions, JWT decode |
| `frontend/src/components/common/ProtectedRoute.tsx` | Route-level permission guard |
| `frontend/src/pages/RoleBuilder.tsx` | UI for building custom roles (15 modules × 7 actions) |
