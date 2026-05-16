const { Queue } = require('bullmq');
const connection = require('../lib/redis');

const payrollQueue = new Queue('payroll-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

const emailQueue = new Queue('email-dispatch', {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

const notifyQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 15000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

module.exports = { payrollQueue, emailQueue, notifyQueue };
