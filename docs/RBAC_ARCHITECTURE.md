# Role-Based Access Control (RBAC) Architecture

## Overview

Bantu-Cloud uses a **module-based RBAC system** where a Client Admin creates roles, assigns module permissions to those roles, and invites users via email. Each user can hold multiple roles within a company, and their effective permissions are the union of all actions granted across all their roles.

---

## Hierarchy

```
Platform Admin (Anthropic / us)
  └── Client Admin (company owner — all modules unlocked, bypasses all checks)
        └── Company Users (assigned roles with specific module permissions)
```

---

## Subscription Plans

Modules available to a client depend on their subscription plan. RBAC roles can only grant permissions to modules the plan unlocks.

| Plan           | Price      | Employee Cap | Modules Included                                              |
|----------------|------------|--------------|---------------------------------------------------------------|
| **Basic**      | $29/mo     | 25           | People, Time & Leave, Payroll, Settings                       |
| **Standard**   | $79/mo     | 100          | All Basic + Compliance, Reports, Loans                        |
| **Premium**    | $149/mo    | 500          | All Standard + Multi-company, API access                      |
| **Enterprise** | Custom     | Unlimited    | All Premium + Dedicated support, Custom integrations          |

---

## Modules

### Tier 1 — Core HR & Payroll ✓

| Module Enum    | Display Name  | Available From | Covers                                                                          |
|----------------|---------------|----------------|---------------------------------------------------------------------------------|
| `PEOPLE`       | People        | Basic          | Employees, grades, departments, branches, loans, documents                      |
| `TIME_LEAVE`   | Time & Leave  | Basic          | Leave records, policies, balances, encashments, attendance, shifts, rosters, devices |
| `PAYROLL`      | Payroll       | Basic          | Payroll runs, payslips, transaction codes, bank files, back pay, pay increase   |
| `COMPLIANCE`   | Compliance    | Standard       | ZIMRA tax tables, NSSA, NEC, statutory rates, tax bands                         |
| `REPORTS`      | Reports       | Standard       | All report exports (P16, TaRMS, NSSA P4A, journals, EFT, etc.)                  |
| `SETTINGS`     | Settings      | Basic          | System settings, currency rates, public holidays, work periods, backup          |

### Tier 2 — Extended HR ✓

| Module Enum   | Display Name | Available From | Covers                                                                      |
|---------------|--------------|----------------|-----------------------------------------------------------------------------|
| `RECRUITMENT` | Recruitment  | Premium        | Job postings, applications, interview pipeline, offer letters               |
| `PERFORMANCE` | Performance  | Premium        | Appraisal cycles, KPIs, ratings, manager review workflow                    |
| `EXPENSES`    | Expenses     | Standard       | Claim submission, approval workflow, payroll integration (per diems, fuel)  |

### Tier 3 — Workforce Development ✓

| Module Enum  | Display Name | Available From | Covers                                                      |
|--------------|--------------|----------------|-------------------------------------------------------------|
| `ONBOARDING` | Onboarding   | Standard       | Task checklists, document collection, equipment assignment  |
| `TRAINING`   | Training     | Premium        | Course tracking, certifications, skills matrix              |
| `ASSETS`     | Assets       | Premium        | Asset assignment per employee, depreciation tracking        |

### Tier 4 — Enterprise Intelligence ✓

| Module Enum  | Display Name | Available From | Covers                                                   |
|--------------|--------------|----------------|----------------------------------------------------------|
| `SUCCESSION` | Succession   | Enterprise     | Career paths, talent pools                               |
| `SURVEYS`    | Surveys      | Enterprise     | Engagement surveys, exit interviews                      |
| `ANALYTICS`  | Analytics    | Enterprise     | Headcount forecasting, turnover trends, workforce BI     |

> All 15 modules share the same RBAC infrastructure — `AppModule` enum, `requireModule()` middleware, and `usePermissions()` hook. Adding a new module requires only adding it to the enum and wiring its routes.

---

## Actions

| Action Enum  | Meaning                                         |
|--------------|-------------------------------------------------|
| `VIEW`       | Read-only access to the module                  |
| `EDIT`       | Create and update records                       |
| `DELETE`     | Remove records                                  |
| `APPROVE`    | Approve/reject workflows (leave, encashments)   |
| `EXPORT`     | Download reports and statutory exports          |
| `RUN`        | Execute payroll runs, process attendance logs   |
| `CONFIGURE`  | Change system-level settings for the module     |

---

## Database Schema

### Models added to `schema.prisma`

```prisma
enum AppModule {
  PEOPLE
  TIME_LEAVE
  PAYROLL
  COMPLIANCE
  REPORTS
  SETTINGS
}

enum ModuleAction {
  VIEW
  EDIT
  DELETE
  APPROVE
  EXPORT
  RUN
  CONFIGURE
}

model Role {
  id            String                @id @default(cuid())
  companyId     String
  name          String
  description   String?
  company       Company               @relation(fields: [companyId], references: [id])
  permissions   RoleModulePermission[]
  userRoles     UserCompanyRole[]
  @@unique([companyId, name])
}

model RoleModulePermission {
  id      String         @id @default(cuid())
  roleId  String
  module  AppModule
  actions ModuleAction[]
  role    Role           @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([roleId, module])
}

model UserCompanyRole {
  id        String  @id @default(cuid())
  userId    String
  companyId String
  roleId    String
  user      User    @relation(fields: [userId], references: [id])
  company   Company @relation(fields: [companyId], references: [id])
  role      Role    @relation(fields: [roleId], references: [id])
  @@unique([userId, companyId, roleId])
}

model Invite {
  id          String       @id @default(cuid())
  companyId   String
  email       String
  roleId      String
  token       String       @unique
  status      InviteStatus @default(PENDING)
  expiresAt   DateTime
  createdAt   DateTime     @default(now())
  company     Company      @relation(fields: [companyId], references: [id])
}

enum InviteStatus {
  PENDING
  ACCEPTED
  CANCELLED
}
```

---

## Backend

### Permission Resolution (`backend/lib/permissions.js`)

Permissions are embedded in the **JWT at sign-token time** so the frontend can read them directly from the decoded token. Additionally, they are **re-resolved on every authenticated request** by the auth middleware so that role changes take effect immediately on the backend.

```
User logs in
  → signToken() called
  → If COMPANY_USER: resolves permissions from DB and embeds in JWT payload
  → If CLIENT_ADMIN / PLATFORM_ADMIN: sets isClientAdmin = true

Frontend reads permissions from JWT decode (does not require a second API call).

On every protected request, auth middleware:
  - Verifies JWT
  - Re-resolves permissions from DB (fresh every request)
  - Attaches result as req.user.permissions = { MODULE: ['ACTION', ...] }
  - Backend always has fresh permissions; frontend uses JWT-embedded copy
```

### Middleware Guards

```js
// Guards entire route file — user must have any permission for the module
router.use(requireModule('PEOPLE'))

// Guards a specific action on a route
router.post('/', requireModulePermission('PEOPLE', 'EDIT'), handler)
```

All ~40 backend route files have `router.use(requireModule('MODULE'))` applied at the router level.

**Legacy flat-permission bridge:** The 229 existing `requirePermission('flat_string')` calls across the codebase are bridged to the RBAC system via `PERMISSION_TO_RBAC` (a mapping from legacy strings to module+action pairs in `permissions.js`). This allows COMPANY_USERs with RBAC permissions to pass legacy action-level guards without rewriting every route file.

### API Routes

| Route                        | Description                                      |
|------------------------------|--------------------------------------------------|
| `GET /api/roles`             | List all roles for the company                   |
| `POST /api/roles`            | Create a new role                                |
| `PUT /api/roles/:id`         | Update role name/description/permissions         |
| `DELETE /api/roles/:id`      | Delete a role                                    |
| `GET /api/roles/:id/users`   | List users assigned to a role                    |
| `POST /api/roles/:id/users`  | Assign a user to a role                          |
| `DELETE /api/roles/:id/users/:userId` | Remove user from a role               |
| `POST /api/invites`          | Send an email invite (CLIENT_ADMIN only)         |
| `GET /api/invites/validate/:token` | Public — validate invite token (via `publicInvites.js`) |
| `POST /api/invites/accept`   | Public — accept invite, create COMPANY_USER (via `publicInvites.js`) |
| `GET /api/invites`           | List invites for the company                     |
| `DELETE /api/invites/:id`    | Cancel a pending invite                          |

---

## Frontend

### `usePermissions` Hook (`frontend/src/hooks/usePermissions.ts`)

```ts
const { can, isClientAdmin } = usePermissions();

can('PEOPLE')           // true if user has any access to PEOPLE module
can('PEOPLE', 'EDIT')   // true if user can edit within PEOPLE module
```

CLIENT_ADMIN and PLATFORM_ADMIN always return `true` from `can()`.

### UI Guards Applied

| Page / Component              | Guarded Actions                                           |
|-------------------------------|-----------------------------------------------------------|
| `EmployeeActions`             | Add Employee, Bulk Import (`PEOPLE/EDIT`)                 |
| `EmployeeTable`               | Edit button (`PEOPLE/EDIT`), Delete button (`PEOPLE/DELETE`) |
| `Grades`                      | New Grade, Edit (`PEOPLE/EDIT`), Delete (`PEOPLE/DELETE`) |
| `Loans`                       | New Loan (`PEOPLE/EDIT`)                                  |
| `Leave`                       | Add Leave (`TIME_LEAVE/EDIT`), Edit row (`TIME_LEAVE/EDIT`), Delete row (`TIME_LEAVE/DELETE`) |
| `LeaveEncashments`            | New Encashment (`TIME_LEAVE/EDIT`), Approve/Reject (`TIME_LEAVE/APPROVE`), Process to Payroll (`TIME_LEAVE/RUN`) |
| `shifts/Shifts`               | New Shift, Edit (`TIME_LEAVE/EDIT`), Delete (`TIME_LEAVE/DELETE`) |
| `attendance/Attendance`       | Manual Entry (`TIME_LEAVE/EDIT`), Process Logs, → Payroll (`TIME_LEAVE/RUN`) |
| `Payroll`                     | New Run, Submit, Process, Rerun (`PAYROLL/RUN`), Approve (`PAYROLL/APPROVE`), ZIMRA/NSSA/Bank exports (`PAYROLL/EXPORT`) |
| `utilities/Transactions`      | Create Code, Edit (`PAYROLL/EDIT`), Delete (`PAYROLL/DELETE`) |
| `Reports`                     | All download buttons (`REPORTS/EXPORT`)                   |

### Navigation Filtering (`AppShell`)

The sidebar navigation is built dynamically — only modules the user has access to are shown. CLIENT_ADMIN always sees all modules plus the **Roles** and **Team Members** management links.

```
CLIENT_ADMIN nav extras:
  Settings → Roles         (/client-admin/roles)
  Settings → Team Members  (/client-admin/users)
```

### New Pages

| Page                            | Route                     | Access          |
|---------------------------------|---------------------------|-----------------|
| `RoleBuilder`                   | `/client-admin/roles`     | CLIENT_ADMIN    |
| `UserManagement`                | `/client-admin/users`     | CLIENT_ADMIN    |
| `AcceptInvite`                  | `/accept-invite`          | Public (token)  |

---

## Invite Flow

```
1. CLIENT_ADMIN opens Team Members → Invites tab
2. Enters email + selects a role → clicks Send Invite
3. System creates an Invite record (token, 7-day expiry) and emails the link
4. New user clicks the link → /accept-invite?token=...
5. Token validated (public endpoint), role and company info shown
6. User sets their name + password → submits
7. A new User is created with role COMPANY_USER
8. UserCompanyRole row links the user to the chosen role
9. User is redirected to /login
```

---

## Permission Examples

### Role: "HR Manager"
```
PEOPLE:     [VIEW, EDIT, DELETE]
TIME_LEAVE: [VIEW, EDIT, APPROVE]
```
→ Can manage employees and approve leave. Cannot see Payroll or Reports.

### Role: "Payroll Officer"
```
PAYROLL:    [VIEW, RUN, EXPORT]
REPORTS:    [VIEW, EXPORT]
```
→ Can process payroll and download reports. Cannot edit employee records.

### Role: "Viewer"
```
PEOPLE:     [VIEW]
PAYROLL:    [VIEW]
REPORTS:    [VIEW, EXPORT]
```
→ Read-only across people and payroll, can export reports.

### CLIENT_ADMIN
→ Bypasses all checks. Has full access to every module and action.
