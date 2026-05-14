import { Hono } from 'hono';
import documentsRoutes from '../routes/documents';
import payslipsRoutes from '../routes/payslips';
import payslipExportsRoutes from '../routes/payslipExports';
import payslipSummariesRoutes from '../routes/payslipSummaries';
import payslipTransactionsRoutes from '../routes/payslipTransactions';

const app = new Hono();
app.route('/documents', documentsRoutes);
app.route('/payslips', payslipsRoutes);
app.route('/payslip-exports', payslipExportsRoutes);
app.route('/payslip-summaries', payslipSummariesRoutes);
app.route('/payslip-transactions', payslipTransactionsRoutes);

export default app;
