// Retries `prisma migrate deploy` up to MAX_ATTEMPTS times with a delay between
// each attempt. Needed because Neon suspends inactive databases; on cold start
// the DB takes several seconds to wake up, and Prisma's advisory lock acquisition
// has a hardcoded 10s timeout that fires before the DB is ready.

const { execSync } = require('child_process');

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('Migrations applied successfully.');
      return;
    } catch {
      if (attempt === MAX_ATTEMPTS) {
        console.error(`Migration failed after ${MAX_ATTEMPTS} attempts. Aborting.`);
        process.exit(1);
      }
      console.log(`Migration attempt ${attempt} failed (DB may be waking up). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

main();
