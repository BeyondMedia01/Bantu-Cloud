import { Hono } from 'hono';
import { initPrisma } from './lib/prisma';
import { initAuth } from './lib/auth';
import { initMailer } from './lib/mailer';
import { initStorage } from './lib/storage';

type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  STORAGE: R2Bucket;
};
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authenticateToken } from './lib/auth';
import { companyContext } from './middleware/companyContext';
import authRoutes from './routes/auth';
import setupRoutes from './routes/setup';
import userRoutes from './routes/user';
import settingsRoutes from './routes/settings';
import adminRoutes from './routes/admin';
import loansRoutes from './routes/loans';
import employeesRoutes from './routes/employees';
import leaveRoutes from './routes/leave';
import documentsRoutes from './routes/documents';
import statutoryRoutes from './routes/statutory';
import reportsRoutes from './routes/reports';
import attendanceRoutes from './routes/attendance';
import payrollRoutes from './routes/payroll';
import platformRoutes from './routes/platform';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  initPrisma(c.env.DATABASE_URL);
  initAuth(c.env.JWT_SECRET);
  initMailer(c.env.RESEND_API_KEY);
  initStorage(c.env.R2_ACCOUNT_ID, c.env.R2_ACCESS_KEY_ID, c.env.R2_SECRET_ACCESS_KEY);
  await next();
});

app.use('*', cors({
  origin: [
    'https://app.bantu.io',
    'https://payroll.thinkbantu.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use('*', secureHeaders());
app.use('*', logger());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/setup', setupRoutes);

app.use('/api/*', authenticateToken);
app.use('/api/*', companyContext);

app.route('/api/user', userRoutes);
app.route('/api', settingsRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/loans', loansRoutes);
app.route('/api/employees', employeesRoutes);
app.route('/api/leave', leaveRoutes);
app.route('/api/documents', documentsRoutes);
app.route('/api', statutoryRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/payroll', payrollRoutes);
app.route('/api', platformRoutes);

export default app;
