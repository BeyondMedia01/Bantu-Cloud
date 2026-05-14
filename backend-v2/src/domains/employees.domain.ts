import { Hono } from 'hono';
import employeesRoutes from '../routes/employees';
import orgRoutes from '../routes/org';
import subCompaniesRoutes from '../routes/subCompanies';
import employeeImportRoutes from '../routes/employeeImport';
import employeeTerminationRoutes from '../routes/employeeTermination';
import dashboardRoutes from '../routes/dashboard';

const app = new Hono();
app.route('/employees', employeesRoutes);
app.route('/', orgRoutes);
app.route('/sub-companies', subCompaniesRoutes);
app.route('/employee-import', employeeImportRoutes);
app.route('/employee-termination', employeeTerminationRoutes);
app.route('/dashboard', dashboardRoutes);

export default app;
