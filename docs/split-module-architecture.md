# RBAC & Module Licensing Architecture

## System Roles

Three hard-coded roles enforced at the JWT/auth layer:

| Role | Who | Access |
|---|---|---|
| `PLATFORM_ADMIN` | Bantu-Cloud operator | Full access to everything; manages all clients |
| `CLIENT_ADMIN` | Client business owner / HR director | Manages their own companies; bypasses module permission checks |
| `COMPANY_USER` | Staff within a company | Access controlled by custom roles + module permissions |

`CLIENT_ADMIN` and `PLATFORM_ADMIN` bypass all module-level checks. `COMPANY_USER` accounts are gated by both the client's enabled modules and their assigned custom role permissions.

There is currently no `EMPLOYEE` role. Employees exist as DB records only and have no login access. The `employeeSelf.js` routes are in place for a future self-service portal.

---

## Custom Roles (per Company)

`COMPANY_USER` accounts are assigned one or more custom roles defined per company (e.g. "HR Manager", "Payroll Officer"). Each custom role carries a set of `RoleModulePermission` entries — which `AppModule` they can access and what actions they can perform within it.

- Roles are company-scoped, not client-scoped.
- A user can hold multiple roles within a company.
- Custom role permissions are constrained to modules the client has enabled — you cannot grant a permission on a module the client is not licensed for.

---

## Module Licensing (Platform Admin → Client)

The platform admin can enable specific modules per client — either all modules or a subset. This is the commercial licensing layer.

### Design Decisions

- No module is mandatory — a client can be payroll-only, HR-only, or any combination.
- Reports and Utilities follow their parent modules — they are not standalone toggles.
- Disabled modules are completely hidden from CLIENT_ADMIN and COMPANY_USER — no "locked" or "upgrade" prompts.
- Disabling a module hides it but preserves all underlying data — re-enabling restores full access.

### Available Modules

| Module | Includes |
|---|---|
| **Payroll** | Payroll runs, payslips, bank files, statutory exports (ZIMRA, NSSA, NEC) |
| **HR** | Employees, grades, departments, branches, documents |
| **Leave** | Leave policies, balances, encashments, monthly accrual |
| **Loans** | Loan management and repayment tracking |
| **Attendance** | Biometric devices, attendance logs, shifts, rosters |
| **Reports** | Follows whichever modules are enabled |
| **Utilities** | Back pay, pay increase, period end, payroll calendar — follows enabled modules |

### Data Model

`enabledModules AppModule[]` stored on the `Client` record. No separate join table needed — PostgreSQL array field via Prisma.

### Auth Flow

On login, the client's `enabledModules` are embedded in the JWT. Every protected route and every nav item checks against this list. COMPANY_USER role permissions are further filtered to only show modules within the client's licensed set.

---

## Build Order (when implementing)

1. Add `enabledModules AppModule[]` to `Client` model in `schema.prisma`
2. Embed enabled modules in JWT on login (`backend/lib/auth.js`)
3. Frontend nav filters by enabled modules
4. Role builder UI filters available modules by client's licensed set
5. Platform admin UI to toggle modules per client
