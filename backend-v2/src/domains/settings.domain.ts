import { Hono } from 'hono';
import settingsRoutes from '../routes/settings';
import workPeriodSettingsRoutes from '../routes/workPeriodSettings';
import reportsRoutes from '../routes/reports';
import reportsPdfRoutes from '../routes/reportsPdf';
import reportsExcelRoutes from '../routes/reportsExcel';
import transactionCodesRoutes from '../routes/transactionCodes';

const app = new Hono();
app.route('/', settingsRoutes);
app.route('/work-period-settings', workPeriodSettingsRoutes);
app.route('/transaction-codes', transactionCodesRoutes);
app.route('/reports', reportsRoutes);
app.route('/reports', reportsPdfRoutes);
app.route('/reports', reportsExcelRoutes);

export default app;
