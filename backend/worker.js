const prisma = require('./lib/prisma');
const { processJob } = require('./lib/jobProcessor');

const POLL_INTERVAL_MS = 1000; // 1 second
const BATCH_SIZE = 5; // process up to 5 jobs at a time

let isShuttingDown = false;

/**
 * Main worker loop.
 */
async function workerLoop() {
  if (isShuttingDown) return;

  try {
    // 1. Fetch pending jobs ready to run
    const jobs = await prisma.job.findMany({
      where: {
        status: 'PENDING',
        runAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (jobs.length > 0) {
      console.log(`[worker] Found ${jobs.length} pending jobs`);
    }

    // 2. Process each job in parallel
    await Promise.all(jobs.map(processOneJob));

  } catch (error) {
    console.error(`[worker] Loop Error:`, error);
  }

  // Schedule next iteration
  if (!isShuttingDown) {
    setTimeout(workerLoop, POLL_INTERVAL_MS);
  }
}

/**
 * Processes a single job record.
 */
async function processOneJob(job) {
  try {
    // Atomically mark job as PROCESSING
    const updateResult = await prisma.job.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'PROCESSING', updatedAt: new Date() },
    });

    if (updateResult.count === 0) {
      // Job was picked up by another worker instance?
      return;
    }

    // Process it
    await processJob(job);

    // Mark as COMPLETED
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', updatedAt: new Date() },
    });

  } catch (error) {
    console.error(`[worker] Error processing job ${job.id}:`, error);

    // Retry or Fail
    const nextAttempts = job.attempts + 1;
    if (nextAttempts >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: error.message,
          attempts: nextAttempts,
          updatedAt: new Date(),
        },
      });
    } else {
      // Exponential backoff for retries
      const retryDelaySeconds = Math.pow(2, nextAttempts) * 30; // 60s, 120s...
      const runAt = new Date();
      runAt.setSeconds(runAt.getSeconds() + retryDelaySeconds);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'PENDING', // Put back in queue
          attempts: nextAttempts,
          runAt,
          updatedAt: new Date(),
        },
      });
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[worker] Received SIGTERM. Shutting down...');
  isShuttingDown = true;
});

process.on('SIGINT', () => {
  console.log('[worker] Received SIGINT. Shutting down...');
  isShuttingDown = true;
});

console.log('[worker] Starting Bantu Job Worker...');
workerLoop();
