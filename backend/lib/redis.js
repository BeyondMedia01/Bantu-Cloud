const { Redis } = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('[Redis] REDIS_URL is not set — queue features will not work');
}

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

module.exports = connection;
