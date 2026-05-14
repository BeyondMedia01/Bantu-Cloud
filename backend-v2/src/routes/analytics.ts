import { Hono } from 'hono';
import { getSql } from '../lib/prisma';

const router = new Hono();

router.get('/overview', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT
        (SELECT COUNT(*) FROM "Employee" WHERE "companyId" = ${companyId})::int AS total_employees,
        (SELECT COUNT(*) FROM "Employee" WHERE "companyId" = ${companyId} AND "dischargeDate" IS NULL)::int AS active_employees,
        (SELECT COUNT(*) FROM "Department" WHERE "companyId" = ${companyId})::int AS departments,
        (SELECT COUNT(*) FROM "LeaveRecord" lr JOIN "Employee" e ON e.id = lr."employeeId" WHERE e."companyId" = ${companyId} AND lr.status = 'PENDING')::int AS pending_leave,
        (SELECT COALESCE(SUM(ps.gross), 0) FROM "Payslip" ps JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId" WHERE pr."companyId" = ${companyId} AND pr.status = 'COMPLETED') AS total_payroll,
        (SELECT COUNT(*) FROM "JobPosting" WHERE "companyId" = ${companyId} AND status = 'PUBLISHED')::int AS open_postings,
        (SELECT COUNT(*) FROM "JobApplication" ja JOIN "JobPosting" jp ON jp.id = ja."jobPostingId" WHERE jp."companyId" = ${companyId})::int AS applications,
        (SELECT COUNT(*) FROM "TrainingCourse" WHERE "companyId" = ${companyId} AND status = 'ACTIVE')::int AS active_courses,
        (SELECT COUNT(*) FROM "PerformanceReview" WHERE "companyId" = ${companyId} AND status = 'DRAFT')::int AS pending_reviews,
        (SELECT COUNT(*) FROM "PerformanceGoal" WHERE "companyId" = ${companyId} AND status = 'ACHIEVED')::int AS achieved_goals,
        (SELECT COUNT(*) FROM "Asset" WHERE "companyId" = ${companyId})::int AS assets
    `;
    const r = rows[0];
    return c.json({
      data: {
        employees: { total: r.total_employees, active: r.active_employees },
        departments: r.departments,
        leave: { pending: r.pending_leave },
        payroll: { totalProcessed: parseFloat(r.total_payroll) || 0 },
        recruitment: { openPostings: r.open_postings, applications: r.applications },
        training: { activeCourses: r.active_courses },
        performance: { pendingReviews: r.pending_reviews, achievedGoals: r.achieved_goals },
        assets: { total: r.assets },
      },
    });
  } catch (error: any) {
    console.error('[analytics/overview]', error?.message);
    return c.json({ message: 'Internal server error', error: error?.message }, 500);
  }
});

router.get('/workforce', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  try {
    const sql = getSql();
    const [deptRows, typeRows] = await Promise.all([
      sql`SELECT d.name, COUNT(e.id)::int AS count FROM "Department" d LEFT JOIN "Employee" e ON e."departmentId" = d.id AND e."companyId" = ${companyId} WHERE d."companyId" = ${companyId} GROUP BY d.id, d.name ORDER BY d.name`,
      sql`SELECT "employmentType", COUNT(*)::int AS count FROM "Employee" WHERE "companyId" = ${companyId} GROUP BY "employmentType"`,
    ]);
    return c.json({
      data: {
        departments: deptRows.map((r: any) => ({ name: r.name, count: r.count })),
        employmentTypes: typeRows.map((r: any) => ({ type: r.employmentType, count: r.count })),
      },
    });
  } catch (error: any) {
    console.error('[analytics/workforce]', error?.message);
    return c.json({ message: 'Internal server error', error: error?.message }, 500);
  }
});

router.get('/recruitment', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  try {
    const sql = getSql();
    const [postingRows, statusRows] = await Promise.all([
      sql`SELECT jp.title, jp.status, COUNT(ja.id)::int AS applications FROM "JobPosting" jp LEFT JOIN "JobApplication" ja ON ja."jobPostingId" = jp.id WHERE jp."companyId" = ${companyId} GROUP BY jp.id, jp.title, jp.status ORDER BY jp."createdAt" DESC LIMIT 10`,
      sql`SELECT ja.status, COUNT(*)::int AS count FROM "JobApplication" ja JOIN "JobPosting" jp ON jp.id = ja."jobPostingId" WHERE jp."companyId" = ${companyId} GROUP BY ja.status`,
    ]);
    return c.json({
      data: {
        postings: postingRows.map((r: any) => ({ title: r.title, status: r.status, applications: r.applications })),
        applicationsByStatus: statusRows.map((r: any) => ({ status: r.status, count: r.count })),
      },
    });
  } catch (error: any) {
    console.error('[analytics/recruitment]', error?.message);
    return c.json({ message: 'Internal server error', error: error?.message }, 500);
  }
});

router.get('/training', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  try {
    const sql = getSql();
    const [courseRows, enrollRows] = await Promise.all([
      sql`SELECT status, COUNT(*)::int AS count FROM "TrainingCourse" WHERE "companyId" = ${companyId} GROUP BY status`,
      sql`SELECT te.status, COUNT(*)::int AS count FROM "TrainingEnrollment" te JOIN "TrainingCourse" tc ON tc.id = te."courseId" WHERE tc."companyId" = ${companyId} GROUP BY te.status`,
    ]);
    return c.json({
      data: {
        coursesByStatus: courseRows.map((r: any) => ({ status: r.status, count: r.count })),
        enrollmentsByStatus: enrollRows.map((r: any) => ({ status: r.status, count: r.count })),
      },
    });
  } catch (error: any) {
    console.error('[analytics/training]', error?.message);
    return c.json({ message: 'Internal server error', error: error?.message }, 500);
  }
});

router.get('/performance', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  try {
    const sql = getSql();
    const [reviewRows, goalRows, ratingRows] = await Promise.all([
      sql`SELECT status, COUNT(*)::int AS count FROM "PerformanceReview" WHERE "companyId" = ${companyId} GROUP BY status`,
      sql`SELECT status, COUNT(*)::int AS count FROM "PerformanceGoal" WHERE "companyId" = ${companyId} GROUP BY status`,
      sql`SELECT AVG(rating) AS avg_rating FROM "PerformanceReview" WHERE "companyId" = ${companyId} AND rating IS NOT NULL`,
    ]);
    const avg = ratingRows[0]?.avg_rating;
    return c.json({
      data: {
        reviewsByStatus: reviewRows.map((r: any) => ({ status: r.status, count: r.count })),
        goalsByStatus: goalRows.map((r: any) => ({ status: r.status, count: r.count })),
        averageRating: avg != null ? +parseFloat(avg).toFixed(1) : null,
      },
    });
  } catch (error: any) {
    console.error('[analytics/performance]', error?.message);
    return c.json({ message: 'Internal server error', error: error?.message }, 500);
  }
});

router.get('/', (c) => c.json({ message: 'Analytics API' }));

export default router;
