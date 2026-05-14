import { Hono } from 'hono';
import authRoutes from '../routes/auth';
import setupRoutes from '../routes/setup';
import publicInvitesRoutes from '../routes/publicInvites';
import biometricRoutes from '../routes/biometric';
import webhooksRoutes from '../routes/webhooks';

const app = new Hono();
app.route('/auth', authRoutes);
app.route('/setup', setupRoutes);
app.route('/invites', publicInvitesRoutes);
app.route('/biometric', biometricRoutes);
app.route('/webhooks', webhooksRoutes);

export default app;
