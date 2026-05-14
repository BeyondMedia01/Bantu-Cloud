import { Hono } from 'hono';
import attendanceRoutes from '../routes/attendance';
import rosterRoutes from '../routes/roster';

const app = new Hono();
app.route('/attendance', attendanceRoutes);
app.route('/roster', rosterRoutes);

export default app;
