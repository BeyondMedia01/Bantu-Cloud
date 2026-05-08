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
// When neither is provided (cron path), the most recent COMPLETED payroll run's endDate is
// resolved per company so accrual always reflects actual payroll, not the server clock.
async function runLeaveAccrual(companyId, accrualDate) {
  // accrualDate pinned at call time (post-payroll trigger); undefined = resolve per company below
  const pinnedDate = accrualDate ? new Date(accrualDate) : null;

  // Used only for the top-level log when a date is pinned
  if (pinnedDate) {
    const y = pinnedDate.getFullYear();
    const m = pinnedDate.getMonth() + 1;
    console.log(`[LeaveAccrual] Starting accrual run for ${y}-${String(m).padStart(2, '0')}${companyId ? ` (company ${companyId})` : ''}`);
  } else {
    console.log(`[LeaveAccrual] Starting accrual run (cron — date resolved per company)${companyId ? ` (company ${companyId})` : ''}`);
  }

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

      // Resolve effective accrual date for this company:
      // - pinned date wins (post-payroll trigger)
      // - otherwise use the most recent COMPLETED payroll run's endDate
      // - fall back to system date only if no completed run exists
      let now = pinnedDate;
      if (!now) {
        const latestRun = await prisma.payrollRun.findFirst({
          where: { companyId, status: 'COMPLETED' },
          orderBy: { endDate: 'desc' },
          select: { endDate: true },
        });
        if (!latestRun) {
          console.warn(`[LeaveAccrual] Company ${companyId} has no completed payroll run — skipping`);
          continue;
        }
        now = new Date(latestRun.endDate);
        console.log(`[LeaveAccrual] Company ${companyId} using accrual date: ${now.toISOString().slice(0, 10)} (from payroll run)`);
      }
      const currentYear  = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Fetch all active employees for this company
      const employees = await prisma.employee.findMany({
        where: {
          companyId,
          dischargeDate: null,
        },
        select: { id: true, startDate: true },
      });

      // Pre-fetch all current-year balances once (eliminates N+1 per employee×policy)
      const allBalances = await prisma.leaveBalance.findMany({
        where: { companyId, year: currentYear },
      });
      const balanceMap = {};
      for (const b of allBalances) {
        if (!balanceMap[b.employeeId]) balanceMap[b.employeeId] = {};
        balanceMap[b.employeeId][b.leaveType] = b;
      }

      // Pre-fetch previous-year balances once if year-end carry-over is needed
      let prevBalanceMap = {};
      if (currentMonth === 1) {
        const prevYearBalances = await prisma.leaveBalance.findMany({
          where: { companyId, year: currentYear - 1 },
        });
        for (const b of prevYearBalances) {
          if (!prevBalanceMap[b.employeeId]) prevBalanceMap[b.employeeId] = {};
          prevBalanceMap[b.employeeId][b.leaveType] = b;
        }
      }

      for (const policy of companyPolicies) {
        for (const emp of employees) {
          try {
            if (emp.startDate && new Date(emp.startDate) >= new Date(currentYear, currentMonth - 1, 1)) {
              totalSkipped++;
              continue;
            }

            // ── Year-end carry-over (January only) — uses pre-fetched map ─────
            if (currentMonth === 1) {
              const prevBalance = prevBalanceMap[emp.id]?.[policy.leaveType];
              if (prevBalance) {
                const closingBalance = prevBalance.balance;
                const carryOver = policy.carryOverLimit > 0
                  ? Math.min(closingBalance, policy.carryOverLimit)
                  : closingBalance;
                const forfeited = Math.max(0, closingBalance - carryOver);

                if (forfeited > 0) {
                  await prisma.leaveBalance.update({
                    where: { id: prevBalance.id },
                    data: { forfeited: prevBalance.forfeited + forfeited, balance: carryOver },
                  });
                }

                const existing = balanceMap[emp.id]?.[policy.leaveType];
                if (!existing && carryOver > 0) {
                  const created = await prisma.leaveBalance.create({
                    data: {
                      employeeId: emp.id, companyId,
                      leavePolicyId: policy.id, leaveType: policy.leaveType,
                      year: currentYear, openingBalance: carryOver,
                      accrued: 0, taken: 0, encashed: 0, forfeited: 0, balance: carryOver,
                    },
                  });
                  if (!balanceMap[emp.id]) balanceMap[emp.id] = {};
                  balanceMap[emp.id][policy.leaveType] = created;
                } else if (existing) {
                  await prisma.leaveBalance.update({
                    where: { id: existing.id },
                    data: {
                      openingBalance: carryOver,
                      balance: carryOver + existing.accrued - existing.taken - existing.encashed,
                    },
                  });
                  existing.openingBalance = carryOver;
                  existing.balance = carryOver + existing.accrued - existing.taken - existing.encashed;
                }
              }
            }

            // ── Look up current-year balance from pre-fetched map ─────────────
            let balance = balanceMap[emp.id]?.[policy.leaveType];

            if (!balance) {
              balance = await prisma.leaveBalance.create({
                data: {
                  employeeId: emp.id, companyId,
                  leavePolicyId: policy.id, leaveType: policy.leaveType,
                  year: currentYear,
                  openingBalance: 0, accrued: 0, taken: 0, encashed: 0, forfeited: 0, balance: 0,
                },
              });
              if (!balanceMap[emp.id]) balanceMap[emp.id] = {};
              balanceMap[emp.id][policy.leaveType] = balance;
            } else if (!balance.leavePolicyId) {
              await prisma.leaveBalance.update({
                where: { id: balance.id },
                data: { leavePolicyId: policy.id },
              });
              balance.leavePolicyId = policy.id;
            }

            // ── Skip if already accrued this month ──────────────────────────
            if (balance.lastAccrualDate) {
              const lastDate = new Date(balance.lastAccrualDate);
              const alreadyThisMonth =
                lastDate.getFullYear() === currentYear &&
                lastDate.getMonth() + 1 === currentMonth;
              const neverActuallyAccrued =
                (balance.accrued || 0) === 0 && (balance.openingBalance || 0) === 0;
              if (alreadyThisMonth && !neverActuallyAccrued) {
                totalSkipped++;
                continue;
              }
            }

            // ── Apply accrual, respecting max cap ──────────────────────────
            const newAccrued = balance.accrued + policy.accrualRate;
            const totalAvailable = balance.openingBalance + newAccrued - balance.taken - balance.encashed;
            const cappedAccrued = policy.maxAccumulation > 0 && totalAvailable > policy.maxAccumulation
              ? Math.max(0, balance.accrued + (policy.maxAccumulation - (balance.openingBalance + balance.accrued - balance.taken - balance.encashed)))
              : newAccrued;

            const newBalance = balance.openingBalance + cappedAccrued - balance.taken - balance.encashed;

            await prisma.leaveBalance.update({
              where: { id: balance.id },
              data: {
                accrued: cappedAccrued,
                balance: Math.max(0, newBalance),
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

module.exports = { runLeaveAccrual };
