import { Hono } from 'hono';
import userRoutes from '../routes/user';
import employeeSelfRoutes from '../routes/employeeSelf';

const app = new Hono();
app.route('/user', userRoutes);
app.route('/employee-self', employeeSelfRoutes);

export default app;
