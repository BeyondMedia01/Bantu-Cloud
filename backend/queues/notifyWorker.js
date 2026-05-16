const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const { runNotifications } = require('../jobs/notifications');

function createNotifyWorker() {
  const worker = new Worker('notifications', async (job) => {
    console.log('[NotifyWorker] Running notifications job');
    const sent = await runNotifications();
    console.log(`[NotifyWorker] ${sent} notification(s) sent`);
  }, {
    connection,
    concurrency: 3,
  });

  worker.on('failed', (job, err) => {
    console.error(`[NotifyWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

module.exports = { createNotifyWorker };
