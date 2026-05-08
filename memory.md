# Bantu-Cloud Platform Memory

This file serves as a persistent context for AI agents working on the Bantu-Cloud platform. It captures the identity, architecture, tech stack, and core business logic of the system.

## 🌟 Platform Identity
**Name**: Bantu Payroll & HR Platform v2.0
**Purpose**: A full-stack payroll and HR management system specifically designed for the **Zimbabwean market**.
**Unique Selling Points**:
- Multi-currency support (USD/ZiG split).
- Local statutory compliance (ZIMRA, NSSA, NEC, SDF, WCIF).
- Integrated Attendance (Biometric devices) and Leave management.
- Scalable multi-tenant architecture.

## 🏗️ Technical Architecture

### 3-Layer Agent System
The project follows a specialized architecture for AI reliability (see `AGENTS.md`):
1.  **Layer 1: Directive (What to do)**: SOPs in `directives/` (Markdown).
2.  **Layer 2: Orchestration (Decision making)**: The AI agent (you) routing intent to tools.
3.  **Layer 3: Execution (Doing the work)**: Deterministic Python/JS scripts in `execution/`.

### Tech Stack
- **Frontend**: React + Vite + TypeScript + TailwindCSS.
- **Backend**: Node.js + Express + Prisma ORM.
- **Database**: PostgreSQL (hosted on Neon).
- **Deployment**: Vercel (Monorepo setup).

### Multi-Tenancy
Enforced hierarchy on every request:
`Platform Admin → Client → Company → Employee`
- Requires `Bearer` JWT and `x-company-id` header.
- Middleware: `backend/middleware/companyContext.js`.

## 💵 Core Business Logic

### Payroll Engine
- **Transaction Codes**: `EARNING`, `DEDUCTION`, `BENEFIT`.
- **Calculation Types**: `FIXED`, `PERCENTAGE`, `FORMULA`.
- **Multi-Currency**: Supports USD and ZiG. Employees can have a `splitUsdPercent` (e.g., 60% USD / 40% ZiG).
- **Tax Methods**: `FDS_AVERAGE`, `FDS_FORECASTING`, `NON_FDS`.
- **Statutory Bodies**: ZIMRA (Tax), NSSA (Social Security), NEC (National Employment Council).

### Leave & Attendance
- **Leave**: Policies per company, monthly accruals via cron (`backend/jobs/`).
- **Attendance**: Biometric integration via webhooks (`/api/biometric`). Logs translated to `AttendanceRecords` with OT (Overtime) logic.

## 📂 Key File Locations
- `backend/prisma/schema.prisma`: Source of truth for the data model.
- `backend/index.js`: Backend entry point and route registration.
- `backend/utils/`: Core math logic (Tax, PDF, YTD).
- `frontend/src/api/`: Frontend service definitions and Axios interceptors.

## 🧠 Current Context & Known Issues
- **Currency Precision**: A known issue exists where ZiG basic salary might show as `2,999.99` instead of `3,000.00` on payslips/summaries due to rounding or floating-point math in the payroll engine.
- **Configuration**: "Working Days Per Period" is a critical configuration for pro-rating and daily rate calculations.

---
*Last Updated: 2026-04-20*
