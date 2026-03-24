const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cron = require('node-cron');
require('dotenv').config();

const { authenticateToken } = require('./lib/auth');
const companyContext = require('./middleware/companyContext');

const app = express();
const PORT = process.env.PORT || 5005;

// Fail fast if required env vars are missing in production
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error('FATAL: FRONTEND_URL must be set in production');
  process.exit(1);
}

// ─── Stripe Webhook (raw body — must come before express.json()) ──────────────
// Stripe requires the raw request body to verify the signature.

// Webhook rate limiter — generous limit to cover Stripe retries without allowing floods
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many webhook requests, please try again later.' },
});
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookLimiter, require('./routes/webhooks'));

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' },
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ message: 'Bantu Payroll API', version: '2.0.0' });
});

// ─── Public Routes (no auth required) ────────────────────────────────────────

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/setup', authLimiter, require('./routes/setup'));
app.use('/api/license/validate', authLimiter, require('./routes/licenseValidate'));
// Biometric device webhooks — devices authenticate via serial + webhookKey inside the handler.
// A dedicated rate limiter prevents brute-force / flooding attacks against the endpoint.
const deviceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many device requests, please try again later.' },
});
app.use('/api/biometric', deviceLimiter, require('./routes/biometric'));

// ─── Protected Routes (auth + company context required) ──────────────────────

app.use(authenticateToken);
app.use(companyContext);

// User info
app.use('/api/user', require('./routes/user'));

// Dashboard
app.use('/api/dashboard', require('./routes/dashboard'));

// Platform & org structure
app.use('/api/clients', require('./routes/clients'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/sub-companies', require('./routes/subCompanies'));

// Employees
app.use('/api/employees', require('./routes/employees'));
app.use('/api/employees', require('./routes/employeeTransactions'));
app.use('/api/employee', require('./routes/employeeSelf'));
app.use('/api/documents', require('./routes/documents'));

// Payroll
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/payroll-core', require('./routes/payrollCore'));
app.use('/api/payslips', require('./routes/payslips'));
app.use('/api/payroll-calendar', require('./routes/payrollCalendar'));
app.use('/api/payroll-inputs', require('./routes/payrollInputs'));
app.use('/api/transaction-codes', require('./routes/transactionCodes'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/tax-tables', require('./routes/taxTables'));
app.use('/api/system-settings', require('./routes/systemSettings'));
app.use('/api/grades', require('./routes/grades'));

// Leave & Loans
app.use('/api/leave', require('./routes/leave'));
app.use('/api/leave-policies', require('./routes/leavePolicies'));
app.use('/api/leave-balances', require('./routes/leaveBalances'));
app.use('/api/leave-encashments', require('./routes/leaveEncashments'));
app.use('/api/loans', require('./routes/loans'));

// License management (PLATFORM_ADMIN)
app.use('/api/license', require('./routes/licenses'));

// Admin (PLATFORM_ADMIN only)
app.use('/api/admin', require('./routes/admin'));

// Reports
app.use('/api/reports', require('./routes/reports'));

// Statutory exports (ZIMRA PAYE P2, NSSA)
app.use('/api/statutory-exports', require('./routes/statutoryExports'));

// Bank payment files (CBZ / Stanbic / Fidelity)
app.use('/api/bank-files', require('./routes/bankFiles'));

// Subscriptions
app.use('/api/subscription', require('./routes/subscriptions'));

// Utilities
app.use('/api/backup', require('./routes/backup'));
app.use('/api/public-holidays', require('./routes/publicHolidays'));
app.use('/api/payincrease', require('./routes/payIncrease'));
app.use('/api/backpay', require('./routes/backPay'));
app.use('/api/period-end', require('./routes/periodEnd'));
app.use('/api/nssa-settings', require('./routes/nssaSettings'));
app.use('/api/statutory-rates', require('./routes/statutoryRates'));
app.use('/api/nssa-contributions', require('./routes/nssaContributions'));
app.use('/api/currency-rates', require('./routes/currencyRates'));
app.use('/api/nec-tables', require('./routes/necTables'));

// Shifts, Roster & Attendance (biometric)
app.use('/api/shifts',     require('./routes/shifts'));
app.use('/api/roster',     require('./routes/roster'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/devices',    require('./routes/devices'));

// Intelligence
app.use('/api/intelligence', require('./routes/intelligence'));

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────

const { runLeaveAccrual } = require('./jobs/leaveAccrual');
// Run at 00:05 on the 1st of every month
cron.schedule('5 0 1 * *', () => runLeaveAccrual());

// ─── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  console.log('--- Bantu Server Startup ---');
  console.log(`Node Version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Searching for port on: ${process.env.PORT || 5005}`);

  try {
    // Run auto-boot actions
    console.log('Running auto-boot actions (Holidays, Transaction Codes)...');
    const { autoSeedHolidays } = require('./utils/holidays');
    const { autoSeedTransactionCodes } = require('./utils/transactionCodes');
    
    await autoSeedHolidays();
    await autoSeedTransactionCodes();
    console.log('Auto-boot actions complete.');

    const portStr = process.env.PORT || '5005';
    const parsedPort = parseInt(portStr, 10);
    app.listen(parsedPort, () => {
      console.log('-------------------------------------------');
      console.log(`🚀 Server ready on port ${parsedPort}`);
      console.log('-------------------------------------------');
    });
  } catch (err) {
    console.error('❌ FATAL STARTUP ERROR:', err);
    process.exit(1);
  }
};

startServer();

process.on('SIGINT', async () => {
  const prisma = require('./lib/prisma');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
