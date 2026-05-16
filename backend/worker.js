require('dotenv').config();
const prisma = require('./lib/prisma');
const { payrollQueue } = require('./queues/index');
const { createPayrollWorker } = require('./queues/payrollWorker');
const { createEmailWorker } = require('./queues/emailWorker');
const { createNotifyWorker } = require('./queues/notifyWorker');

const STALE_PROCESSING_MINUTES = 5;

async function recoverStaleRuns() {
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000);
  const staleRuns = await prisma.payrollRun.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleThreshold } },
    select: {
      id: true,
      companyId: true,
      company: { select: { clientId: true } },
    },
  });

  if (staleRuns.length === 0) return;

  console.log(`[worker] Recovering ${staleRuns.length} stale PROCESSING run(s)`);

  for (const run of staleRuns) {
    await prisma.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });
    await prisma.payslip.deleteMany({ where: { payrollRunId: run.id } });

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'QUEUED', progress: 0, employeesProcessed: 0 },
    });

    await payrollQueue.add('process', {
      runId: run.id,
      companyId: run.companyId,
      clientId: run.company.clientId,
      userId: null,
      adjustments: {},
    }, {
      jobId: `payroll-${run.id}`,
    });

    console.log(`[worker] Re-enqueued stale run ${run.id}`);
  }
}

async function main() {
  console.log('[worker] Starting Bantu Job Worker (BullMQ)...');

  await recoverStaleRuns();

  const payrollWorker = createPayrollWorker();
  const emailWorker = createEmailWorker();
  const notifyWorker = createNotifyWorker();

  console.log('[worker] All workers started. Listening for jobs...');

  async function shutdown(signal) {
    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);
    const timeout = setTimeout(() => {
      console.error('[worker] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30000);

    await Promise.all([
      payrollWorker.close(),
      emailWorker.close(),
      notifyWorker.close(),
    ]);

    clearTimeout(timeout);
    await prisma.$disconnect();
    console.log('[worker] Shutdown complete.');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});
