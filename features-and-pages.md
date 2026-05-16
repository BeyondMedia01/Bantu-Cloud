# Bantu Payroll & HR Platform — Features & Pages

## Features by Module

### PEOPLE — Employee Database
- Employee CRUD (full lifecycle incl. termination)
- Bulk CSV/Excel import with validation
- Org hierarchy: Client → Company → SubCompany → Branch → Department
- Salary grades with NEC-linked min/max rates
- Document management (contracts, IDs, medical, education)
- Employee self-service profile
- Mass salary adjustments (pay increase tool)

### TIME_LEAVE — Attendance & Leave
- Leave policy configuration per company
- Automatic monthly leave accrual (cron)
- Leave request workflow (submit → approve → reject)
- Leave balance tracking (opening + accrued - taken - encashed)
- Carry-over limits and accumulation caps
- Leave encashment workflow
- Biometric device registration (ZKTeco, Hikvision)
- Attendance engine: IN/OUT punch pairing
- Overtime calculation (×1.0, ×1.5, ×2.0 multipliers)
- Shift configuration with break rules
- Public holiday management
- Manual attendance entry for corrections

### PAYROLL — Payroll Engine
- Payroll calendar with period management (open/close)
- Run lifecycle: Preview → Submit → Approve → Process
- Transaction codes: EARNING / DEDUCTION / BENEFIT
- Calculation types: FIXED, PERCENTAGE, FORMULA
- Conditional rules (grade-based, salary threshold, hours-based)
- Multi-currency payroll: per-employee USD/ZiG split
- Tax methods: FDS_AVERAGE, FDS_FORECASTING, NON_FDS
- PAYE tax calculation (ZIMRA bands)
- AIDS Levy, NSSA, NEC, SDF, WCIF, ZIMDEF calculations
- Dual-currency payslip PDF (HTML-rendered, Print→Save as PDF)
- Medical Aid Credit (informational display, excluded from totals)
- Employee loan repayment auto-deduction
- Back pay processing
- Bulk pay increases

### COMPLIANCE — Statutory
- ZIMRA IT7 (P16) annual tax certificates
- ZIMRA P2 monthly returns
- NSSA P4A monthly returns
- Tax table management with effective dates
- Motor vehicle benefit calculation
- Tax directive handling

### REPORTS — Reporting & Export
- Payslip reports (individual + batch PDF/CSV)
- Tax reports (ZIMRA format)
- Leave reports
- Loan reports
- Department headcount
- Journal entries
- Bank EFT/bulk pay files (CBZ, Stanbic, Fidelity)
- Pension fund exports
- Payroll variance analysis
- Payroll trends
- NSSA P4A returns

### SETTINGS — Configuration
- System-wide settings (AIDS levy rate, NSSA thresholds)
- Currency rate management (USD/ZiG)
- Public holiday management
- Work period configuration
- Company-level defaults and preferences

### PLATFORM — Administration
- Multi-tenant client management
- RBAC role builder (15 modules × 7 actions)
- User invitation and management
- License key management and seat tracking
- Audit logging (all state-changing operations)
- System-wide audit trail

### Tier 2–4 Modules (Future / Lower Priority)
- **RECRUITMENT:** Job postings, applications, interview scheduling, offer letters
- **PERFORMANCE:** Appraisals, KPIs, manager reviews, ratings
- **EXPENSES:** Claims, approval workflow, payroll integration
- **ONBOARDING:** Checklists, document collection, equipment tracking
- **TRAINING:** Course catalog, certifications, skills matrix
- **ASSETS:** Asset assignment, depreciation tracking
- **SUCCESSION:** Career paths, talent pool
- **SURVEYS:** Engagement surveys, exit interviews
- **ANALYTICS:** Headcount forecasting, turnover trends, BI dashboard

---

## Pages by Access Level

### Public (Unauthenticated)

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Marketing, product overview, sign-up CTA |
| Login | `/login` | Email/password authentication |
| Register | `/register` | Self-service account creation |
| Setup | `/setup` | First-time company configuration |
| Accept Invite | `/accept-invite` | Join existing company |
| License Expired | `/license-expired` | Subscription lapsed notice |

### Employee Self-Service

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/employee` | Personal summary: leave, payslips, profile |
| My Payslips | `/employee/payslips` | View/download personal payslips |
| My Profile | `/employee/profile` | Edit personal details |
| My Leave | `/employee/leave` | Submit leave, view balance |

### Client Admin / Company User

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | KPI overview, alerts |
| Employees | `/employees` | Employee list, search, actions |
| Add Employee | `/employees/new` | Create employee record |
| Edit Employee | `/employees/:id/edit` | Manage employee record |
| Import Employees | `/employees/import` | Bulk CSV upload |
| Payroll Runs | `/payroll` | Payroll calendar, period management |
| New Payroll Run | `/payroll/new` | Initiate payroll run |
| Payroll Detail | `/payroll/:runId` | Run summary, lifecycle actions |
| Payslips | `/payroll/:runId/payslips` | Per-employee payslip preview & PDF |
| Leave | `/leave` | Leave request list |
| New Leave | `/leave/new` | Submit leave |
| Loans | `/loans` | Loan register |
| New Loan | `/loans/new` | Issue new loan |
| Loan Detail | `/loans/:id` | Amortisation, payment history |
| Reports | `/reports` | 20+ report types, exports |
| Subscription | `/subscription` | Plan & billing management |
| Licence | `/license` | License details, seat count |

### Client Admin Only

| Page | Route | Purpose |
|------|-------|---------|
| Org Structure | `/client-admin/structure` | Company hierarchy editor |
| Settings | `/client-admin/settings` | Company-level defaults |
| Role Builder | `/client-admin/roles` | Custom RBAC role creation |
| User Management | `/client-admin/users` | Invite/manage users, assign roles |

### Utilities

| Page | Route | Purpose |
|------|-------|---------|
| Utilities Hub | `/utilities` | Index of all utility tools |
| Transaction Codes | `/utilities/transactions` | Define earning/deduction/benefit codes |
| Back Pay | `/utilities/back-pay` | Retroactive pay adjustments |
| Import Earnings | `/utilities/import-earnings` | Bulk one-time earnings/deductions |
| Pay Increase | `/utilities/pay-increase` | Mass salary adjustment |
| Period End | `/utilities/period-end` | Close/open payroll periods |
| Biometric Devices | `/utilities/devices` | Register/manage ZKTeco/Hikvision |
| Payroll Calendar | `/utilities/payroll-calendar` | Define pay periods & schedules |
| Currency Rates | `/utilities/currency-rates` | USD/ZiG exchange rates |
| Holidays | `/utilities/holidays` | Public holiday calendar |

### Platform Admin (Bantu Internal)

| Page | Route | Purpose |
|------|-------|---------|
| Admin Dashboard | `/admin` | Global metrics, system health |
| Users | `/admin/users` | All users across clients |
| Clients | `/admin/clients` | Client lifecycle management |
| Licences | `/admin/licenses` | License keys, seats, expiry |
| Roles | `/admin/roles` | Global role templates |
| Audit Logs | `/admin/logs` | System-wide audit trail |
| System Settings | `/admin/settings` | Tax rates, thresholds, defaults |

---

**Total: 8 feature modules (50+ feature requirements), 41 pages across 6 access levels.**
