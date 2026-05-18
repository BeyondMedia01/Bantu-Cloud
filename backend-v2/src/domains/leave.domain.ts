import { Hono } from 'hono';
import leaveRoutes from '../routes/leave';
import leavePoliciesRoutes from '../routes/leavePolicies';
import leaveBalancesRoutes from '../routes/leaveBalances';
import leaveEncashmentsRoutes from '../routes/leaveEncashments';
import leaveTypesRoutes from '../routes/leaveTypes';
import leavePolicyAssignmentsRoutes from '../routes/leavePolicyAssignments';
import leaveTransactionsRoutes from '../routes/leaveTransactions';
import leaveAllocationsRoutes from '../routes/leaveAllocations';

const app = new Hono();
app.route('/leave', leaveRoutes);
app.route('/leave-policies', leavePoliciesRoutes);
app.route('/leave-balances', leaveBalancesRoutes);
app.route('/leave-encashments', leaveEncashmentsRoutes);
app.route('/leave-types', leaveTypesRoutes);
app.route('/leave-policy-assignments', leavePolicyAssignmentsRoutes);
app.route('/leave-transactions', leaveTransactionsRoutes);
app.route('/leave-allocations', leaveAllocationsRoutes);

export default app;
