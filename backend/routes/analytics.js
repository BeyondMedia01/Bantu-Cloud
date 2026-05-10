const express = require('express');
const prisma = require('../lib/prisma');


const router = express.Router();


router.get('/overview', async (req, res) => {
  const companyFilter = req.companyId ? { companyId: req.companyId } : {};
  try {
    const [
      employeeCount, activeEmployeeCount, departmentCount,
      pendingLeave, payrollTotal, postingCount, applicationCount,
      courseCount, activeReviewCount, goalAchievedCount, assetCount,
    ] = await Promise.all([
      prisma.employee.count({ where: companyFilter }),
      prisma.employee.count({ where: { ...companyFilter, dischargeDate: null } }),
      prisma.department.count({ where: { companyId: req.companyId } }),
      prisma.leaveRecord.count({ where: { ...companyFilter, status: 'PENDING' } }),
      prisma.payrollRun.aggregate({ where: { ...companyFilter, status: 'PROCESSED' }, _sum: { totalGross: true } }),
      prisma.jobPosting.count({ where: { ...companyFilter, status: 'PUBLISHED' } }),
      prisma.jobApplication.count({ where: { jobPosting: companyFilter } }),
      prisma.trainingCourse.count({ where: { ...companyFilter, status: 'ACTIVE' } }),
      prisma.performanceReview.count({ where: { ...companyFilter, status: 'DRAFT' } }),
      prisma.performanceGoal.count({ where: { ...companyFilter, status: 'ACHIEVED' } }),
      prisma.asset.count({ where: companyFilter }),
    ]);

    res.json({
      data: {
        employees: { total: employeeCount, active: activeEmployeeCount },
        departments: departmentCount,
        leave: { pending: pendingLeave },
        payroll: { totalProcessed: payrollTotal._sum.totalGross || 0 },
        recruitment: { openPostings: postingCount, applications: applicationCount },
        training: { activeCourses: courseCount },
        performance: { pendingReviews: activeReviewCount, achievedGoals: goalAchievedCount },
        assets: { total: assetCount },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/workforce', async (req, res) => {
  const companyFilter = req.companyId ? { companyId: req.companyId } : {};
  try {
    const [departments, employmentTypes] = await Promise.all([
      prisma.department.findMany({
        where: { companyId: req.companyId },
        include: { _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.employee.groupBy({ by: ['employmentType'], where: companyFilter, _count: true }),
    ]);

    res.json({
      data: {
        departments: departments.map(d => ({ name: d.name, count: d._count.employees })),
        employmentTypes: employmentTypes.map(e => ({ type: e.employmentType, count: e._count })),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/recruitment', async (req, res) => {
  const companyFilter = req.companyId ? { companyId: req.companyId } : {};
  try {
    const [postings, appByStatus] = await Promise.all([
      prisma.jobPosting.findMany({
        where: companyFilter,
        include: { _count: { select: { applications: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.jobApplication.groupBy({ by: ['status'], where: { jobPosting: companyFilter }, _count: true }),
    ]);

    res.json({
      data: {
        postings: postings.map(p => ({ title: p.title, status: p.status, applications: p._count.applications })),
        applicationsByStatus: appByStatus.map(a => ({ status: a.status, count: a._count })),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/training', async (req, res) => {
  const companyFilter = req.companyId ? { companyId: req.companyId } : {};
  try {
    const [statusDist, enrollments] = await Promise.all([
      prisma.trainingCourse.groupBy({ by: ['status'], where: companyFilter, _count: true }),
      prisma.trainingEnrollment.groupBy({ by: ['status'], where: { course: companyFilter }, _count: true }),
    ]);

    res.json({
      data: {
        coursesByStatus: statusDist.map(s => ({ status: s.status, count: s._count })),
        enrollmentsByStatus: enrollments.map(e => ({ status: e.status, count: e._count })),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/performance', async (req, res) => {
  const companyFilter = req.companyId ? { companyId: req.companyId } : {};
  try {
    const [reviewStatus, goalStatus, avgRating] = await Promise.all([
      prisma.performanceReview.groupBy({ by: ['status'], where: companyFilter, _count: true }),
      prisma.performanceGoal.groupBy({ by: ['status'], where: companyFilter, _count: true }),
      prisma.performanceReview.aggregate({ where: { ...companyFilter, rating: { not: null } }, _avg: { rating: true } }),
    ]);

    res.json({
      data: {
        reviewsByStatus: reviewStatus.map(r => ({ status: r.status, count: r._count })),
        goalsByStatus: goalStatus.map(g => ({ status: g.status, count: g._count })),
        averageRating: avgRating._avg.rating ? +avgRating._avg.rating.toFixed(1) : null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
