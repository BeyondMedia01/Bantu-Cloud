import { Hono } from 'hono';
import leaveRoutes from '../routes/leave';
import leavePoliciesRoutes from '../routes/leavePolicies';
import leaveBalancesRoutes from '../routes/leaveBalances';
import leaveEncashmentsRoutes from '../routes/leaveEncashments';

const app = new Hono();
app.route('/leave', leaveRoutes);
app.route('/leave-policies', leavePoliciesRoutes);
app.route('/leave-balances', leaveBalancesRoutes);
app.route('/leave-encashments', leaveEncashmentsRoutes);

export default app;
