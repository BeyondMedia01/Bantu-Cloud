const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

/**
 * POST /api/payincrease
 * Applies a bulk pay increase to a set of employees.
 *
 * Body:
 *   { employeeIds?: string[], percentage?: number, amount?: number,
 *     effectiveDate: string, filter?: { departmentId, branchId, employmentType } }
 *
 * Either percentage OR amount must be provided.
 * If employeeIds is omitted, the filter is used to target employees.
 */
router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { employeeIds, percentage, amount, effectiveDate, filter = {} } = req.body;

  if (!effectiveDate) return res.status(400).json({ message: 'effectiveDate is required' });
  if (percentage === undefined && amount === undefined) {
    return res.status(400).json({ message: 'Either percentage or amount is required' });
  }

  try {
    // Resolve target employees
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(employeeIds?.length && { id: { in: employeeIds } }),
      ...(filter.departmentId && { departmentId: filter.departmentId }),
      ...(filter.branchId && { branchId: filter.branchId }),
      ...(filter.employmentType && { employmentType: filter.employmentType }),
    };

    const employees = await prisma.employee.findMany({ where, select: { id: true, baseRate: true } });

    if (employees.length === 0) return res.status(400).json({ message: 'No matching employees found' });

    // Warn if the effective date is in the future — rate is applied immediately
    // regardless, so back-pay will be needed for the gap period.
    const isFutureDate = new Date(effectiveDate) > new Date();

    // Apply increase — capture old rate for audit trail
    const updates = await Promise.all(
      employees.map((emp) => {
        const oldRate = emp.baseRate;
        const newRate = percentage !== undefined
          ? emp.baseRate * (1 + parseFloat(percentage) / 100)
          : emp.baseRate + parseFloat(amount);
        const roundedNew = Math.round(newRate * 100) / 100;

        return prisma.employee.update({
          where: { id: emp.id },
          data: { baseRate: roundedNew },
          select: { id: true, baseRate: true, firstName: true, lastName: true, currency: true },
        }).then((updated) => ({ ...updated, oldRate }));
      })
    );

    await audit({
      req,
      action: 'PAY_INCREASE_APPLIED',
      resource: 'employee',
      details: {
        effectiveDate,
        isFutureEffectiveDate: isFutureDate,
        method: percentage !== undefined ? 'percentage' : 'fixed_amount',
        value: percentage !== undefined ? percentage : amount,
        employees: updates.map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          oldRate: u.oldRate,
          newRate: u.baseRate,
          currency: u.currency,
        })),
      },
    });

    res.json({
      message: `Pay increase applied to ${updates.length} employee(s)${isFutureDate ? ' — note: effective date is in the future; use Back Pay to recover the gap' : ''}`,
      effectiveDate,
      isFutureEffectiveDate: isFutureDate,
      employees: updates,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
