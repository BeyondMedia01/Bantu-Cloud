import { Hono } from 'hono';
import loansRoutes from '../routes/loans';

const app = new Hono();
app.route('/loans', loansRoutes);

export default app;
