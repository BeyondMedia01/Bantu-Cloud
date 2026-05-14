import { Hono } from 'hono';
import payrollRoutes from '../routes/payroll';
import payrollProcessRoutes from '../routes/payrollProcess';
import payrollCoreRoutes from '../routes/payrollCore';
import payrollUsersRoutes from '../routes/payrollUsers';
import payrollLogsRoutes from '../routes/payrollLogs';
import backPayRoutes from '../routes/backPay';
import payIncreaseRoutes from '../routes/payIncrease';
import backupRoutes from '../routes/backup';
import periodEndRoutes from '../routes/periodEnd';
import payrollInputsRoutes from '../routes/payrollInputs';
import payrollCalendarRoutes from '../routes/payrollCalendar';

const app = new Hono();
app.route('/payroll', payrollRoutes);
app.route('/payroll', payrollProcessRoutes);
app.route('/payroll-core', payrollCoreRoutes);
app.route('/payroll-users', payrollUsersRoutes);
app.route('/payroll-logs', payrollLogsRoutes);
app.route('/payroll-inputs', payrollInputsRoutes);
app.route('/payroll-calendar', payrollCalendarRoutes);
app.route('/backpay', backPayRoutes);
app.route('/payincrease', payIncreaseRoutes);
app.route('/backup', backupRoutes);
app.route('/period-end', periodEndRoutes);

export default app;
