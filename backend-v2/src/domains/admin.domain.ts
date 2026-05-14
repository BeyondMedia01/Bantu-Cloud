import { Hono } from 'hono';
import adminRoutes from '../routes/admin';
import rolesRoutes from '../routes/roles';
import invitesRoutes from '../routes/invites';
import platformRoutes from '../routes/platform';
import clientsRoutes from '../routes/clients';
import subscriptionsRoutes from '../routes/subscriptions';
import syncRoutes from '../routes/sync';
import seedRoutes from '../routes/seed';

const app = new Hono();
app.route('/admin', adminRoutes);
app.route('/roles', rolesRoutes);
app.route('/invites', invitesRoutes);
app.route('/', platformRoutes);
app.route('/clients', clientsRoutes);
app.route('/subscriptions', subscriptionsRoutes);
app.route('/sync', syncRoutes);
app.route('/seed', seedRoutes);

export default app;
