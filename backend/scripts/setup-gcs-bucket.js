'use strict';

/**
 * One-time GCS bucket setup for the Bantu Migration Engine.
 * Run: node scripts/setup-gcs-bucket.js
 *
 * Requires: GOOGLE_CLOUD_PROJECT and MIGRATION_BUCKET env vars.
 */

require('dotenv').config();
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;

if (!BUCKET_NAME) {
  console.error('FATAL: MIGRATION_BUCKET env var not set');
  process.exit(1);
}

async function setup() {
  // Create bucket if it doesn't exist
  const [bucket] = await storage.createBucket(BUCKET_NAME, {
    location: 'US',
    storageClass: 'STANDARD',
  }).catch(err => {
    if (err.code === 409) return [storage.bucket(BUCKET_NAME)]; // already exists
    throw err;
  });

  // temp/ — 30-day auto-delete
  await bucket.addLifecycleRule({
    action: { type: 'Delete' },
    condition: { age: 30, matchesPrefix: ['temp/'] },
  });

  // archive/ — 7-year retention (ZIMRA compliance)
  await bucket.addLifecycleRule({
    action: { type: 'Delete' },
    condition: { age: 2555, matchesPrefix: ['archive/'] }, // 7 * 365
  });

  console.log(`✓ Bucket ${BUCKET_NAME} configured with lifecycle policies`);
}

setup().catch(err => { console.error(err); process.exit(1); });
