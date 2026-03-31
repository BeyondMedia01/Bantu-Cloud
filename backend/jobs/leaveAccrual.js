/**
 * Leave Accrual Job
 *
 * Runs on the 1st of every month at 00:05.
 * For every active company, reads LeavePolicies with accrualRate > 0 and
 * increments each qualifying employee's LeaveBalance for the current year.
 *
 * Rules:
 *  - Skip employees whose lastAccrualDate is already in the current month
 *    (prevents double-accrual if the job is re-run).
 *  - Cap accrued days at LeavePolicy.maxAccumulation.
 *  - On January run: carry-over previous year's balance up to carryOverLimit;
 *    any remainder is forfeited (recorded in LeaveBalance.forfeited).
 */

const prisma = require('../lib/prisma');

// companyId is optional — when provided, only that company is processed (post-payroll trigger).
// accrualDate is optional — when provided (post-payroll trigger), uses the payroll run's month
// instead of today's date. This allows processing future payrolls (e.g. running April payroll
// in late March) and still accruing for the correct month.
async function runLeaveAccrual(companyId, accrualDate) {
  const now = accrualDate ? new Date(accrualDate) : new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  console.log(`[LeaveAccrual] Starting accrual run for ${currentYear}-${String(currentMonth).padStart(2, '0')}${companyId ? ` (company ${companyId})` : ''}`);

  let totalAccrued = 0;
  let totalSkipped = 0;
  let totalErrors  = 0;
  const errors = [];

  try {
    // Fetch active leave policies — optionally scoped to one company
    const policies = await prisma.leavePolicy.findMany({
      where: {
        isActive: true,
        accrualRate: { gt: 0 },
        ...(companyId && { companyId }),
      },
    });

    if (policies.length === 0) {
      console.log('[LeaveAccrual] No active policies with accrual rate > 0. Done.');
      return;
    }

    // Group policies by companyId for efficient employee lookup
    const companyIds = [...new Set(policies.map((p) => p.companyId))];

    for (const companyId of companyIds) {
      const companyPolicies = policies.filter((p) => p.companyId === companyId);

      // Fetch all active employees for this company
      const employees = await prisma.employee.findMany({
        where: {
          companyId,
          dischargeDate: null, // exclude terminated employees
        },
        select: { id: true, startDate: true },
      });

      for (const policy of companyPolicies) {
        for (const emp of employees) {
          try {
            // Employee must have started before the current month
            if (emp.startDate && new Date(emp.startDate) >= new Date(currentYear, currentMonth - 1, 1)) {
              totalSkipped++;
              continue;
            }

            // ── Year-end carry-over: handle on January run ──────────────────────
            if (currentMonth === 1) {
              await handleYearEnd(emp.id, companyId, policy, currentYear);
            }

            // ── Find or create current-year balance ─────────────────────────────
            // NOTE: query by (employeeId, leaveType, year) — the actual unique key.
            // Do NOT filter by leavePolicyId: a balance may exist from a leave request
            // or import with leavePolicyId = null, and filtering by policy.id would miss
            // it and then fail with a unique-constraint violation on create.
            let balance = await prisma.leaveBalance.findFirst({
              where: {
                employeeId: emp.id,
                companyId,
                leaveType:  policy.leaveType,
                year:       currentYear,
              },
            });

            if (!balance) {
              balance = await prisma.leaveBalance.create({
                data: {
                  employeeId:    emp.id,
                  companyId,
                  leavePolicyId: policy.id,
                  leaveType:     policy.leaveType,
                  year:          currentYear,
                  openingBalance: 0,
                  accrued:       0,
                  taken:         0,
                  encashed:      0,
                  forfeited:     0,
                  balance:       0,
                },
              });
            } else if (!balance.leavePolicyId) {
              // Back-fill the policy link if it was created without one
              await prisma.leaveBalance.update({
                where: { id: balance.id },
                data:  { leavePolicyId: policy.id },
              });
            }

            // ── Skip if already accrued this month ──────────────────────────────
            // BUT don't skip if the record was created with balance=0 and was never
            // actually credited (accrued=0 and openingBalance=0) — that indicates a
            // ghost record that needs to be fixed regardless of lastAccrualDate.
            if (balance.lastAccrualDate) {
              const lastDate = new Date(balance.lastAccrualDate);
              const alreadyThisMonth =
                lastDate.getFullYear() === currentYear &&
                lastDate.getMonth() + 1 === currentMonth;
              const neverActuallyAccrued =
                (balance.accrued || 0) === 0 && (balance.openingBalance || 0) === 0;
              if (alreadyThisMonth && !neverActuallyAccrued) {
                totalSkipped++;
                continue; // already ran this month and has real data
              }
            }

            // ── Apply accrual, respecting max cap ──────────────────────────────
            const newAccrued = balance.accrued + policy.accrualRate;
            const totalAvailable = balance.openingBalance + newAccrued - balance.taken - balance.encashed;
            const cappedAccrued = policy.maxAccumulation > 0 && totalAvailable > policy.maxAccumulation
              ? Math.max(0, balance.accrued + (policy.maxAccumulation - (balance.openingBalance + balance.accrued - balance.taken - balance.encashed)))
              : newAccrued;

            const newBalance = balance.openingBalance + cappedAccrued - balance.taken - balance.encashed;

            await prisma.leaveBalance.update({
              where: { id: balance.id },
              data: {
                accrued:         cappedAccrued,
                balance:         Math.max(0, newBalance),
                lastAccrualDate: now,
              },
            });

            totalAccrued++;
          } catch (empErr) {
            totalErrors++;
            console.error(
              `[LeaveAccrual] Failed for employee ${emp.id} policy ${policy.id}:`,
              empErr.message
            );
            errors.push({ employeeId: emp.id, policyId: policy.id, leaveType: policy.leaveType, message: empErr.message });
          }
        }
      }
    }

    const summary = { accrued: totalAccrued, skipped: totalSkipped, errors: totalErrors };
    console.log(`[LeaveAccrual] Run complete — accrued: ${totalAccrued}, skipped: ${totalSkipped}, errors: ${totalErrors}`);

    if (totalErrors > 0) {
      console.error('[LeaveAccrual] Errors detail:', JSON.stringify(errors));
      const err = new Error(`Leave accrual completed with ${totalErrors} error(s). First: ${errors[0].message}`);
      err.accrualSummary = summary;
      err.accrualErrors = errors;
      throw err;
    }

    return summary;
  } catch (err) {
    if (err.accrualSummary) throw err; // already structured, re-throw as-is
    console.error('[LeaveAccrual] Fatal error during accrual run:', err);
    throw err;
  }
}

/**
 * Handle year-end: create the new year's opening balance from last year's closing balance,
 * applying the carry-over cap and recording any forfeiture.
 */
async function handleYearEnd(employeeId, companyId, policy, currentYear) {
  const prevYear = currentYear - 1;

  // Query by (employeeId, leaveType, year) — the actual unique key, not leavePolicyId
  const prevBalance = await prisma.leaveBalance.findFirst({
    where: { employeeId, companyId, leaveType: policy.leaveType, year: prevYear },
  });

  if (!prevBalance) return;

  const closingBalance = prevBalance.balance;
  const carryOver = policy.carryOverLimit > 0
    ? Math.min(closingBalance, policy.carryOverLimit)
    : closingBalance;
  const forfeited = Math.max(0, closingBalance - carryOver);

  // Record forfeiture on prior year record
  if (forfeited > 0) {
    await prisma.leaveBalance.update({
      where: { id: prevBalance.id },
      data: { forfeited: prevBalance.forfeited + forfeited, balance: carryOver },
    });
  }

  // Set opening balance on current year (create if not exists yet)
  const existing = await prisma.leaveBalance.findFirst({
    where: { employeeId, companyId, leaveType: policy.leaveType, year: currentYear },
  });

  if (!existing && carryOver > 0) {
    await prisma.leaveBalance.create({
      data: {
        employeeId,
        companyId,
        leavePolicyId:  policy.id,
        leaveType:      policy.leaveType,
        year:           currentYear,
        openingBalance: carryOver,
        accrued:        0,
        taken:          0,
        encashed:       0,
        forfeited:      0,
        balance:        carryOver,
      },
    });
  } else if (existing) {
    await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: {
        openingBalance: carryOver,
        balance: carryOver + existing.accrued - existing.taken - existing.encashed,
      },
    });
  }
}

module.exports = { runLeaveAccrual };
