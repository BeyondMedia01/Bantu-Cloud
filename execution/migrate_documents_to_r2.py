#!/usr/bin/env python3
"""
Migrate employee documents from v1 filesystem (Render) to Cloudflare R2.

Usage:
    python3 execution/migrate_documents_to_r2.py

Requires:
    pip install boto3 psycopg2-binary

Environment variables:
    DATABASE_URL  — Neon PostgreSQL connection string
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — R2 credentials
    R2_BUCKET     — R2 bucket name (default: bantu-production)
    DOCUMENTS_DIR — Local path to v1 uploads (default: ../backend/uploads/documents)

This script:
    1. Queries all EmployeeDocument records with legacy fileUrl (starting with /uploads/)
    2. Reads the file from the local filesystem
    3. Uploads to R2 with key format: employees/{employeeId}/{timestamp}-{filename}
    4. Updates the DB record fileUrl to the new R2 key
    5. Skips already-migrated records (fileUrl starting with 'employees/')
"""

import os
import sys
import boto3
import psycopg2
from urllib.parse import urlparse

DATABASE_URL = os.environ.get('DATABASE_URL')
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET = os.environ.get('R2_BUCKET', 'bantu-production')
DOCUMENTS_DIR = os.environ.get('DOCUMENTS_DIR', os.path.join(os.path.dirname(__file__), '..', 'backend', 'uploads', 'documents'))

if not all([DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
    print("ERROR: Missing required environment variables.")
    print("Set: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
    sys.exit(1)

s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, employee_id, name, file_url
    FROM "EmployeeDocument"
    WHERE file_url LIKE '/uploads/%'
    ORDER BY created_at ASC
""")
rows = cur.fetchall()
print(f"Found {len(rows)} legacy documents to migrate.")

migrated = 0
failed = 0

for doc_id, employee_id, name, file_url in rows:
    filename = os.path.basename(file_url)
    local_path = os.path.join(DOCUMENTS_DIR, filename)
    r2_key = f"employees/{employee_id}/{int(os.path.getmtime(local_path) if os.path.exists(local_path) else 0)}-{filename}"

    if not os.path.exists(local_path):
        print(f"  SKIP  {doc_id[:8]} — file not found on disk: {local_path}")
        failed += 1
        continue

    try:
        with open(local_path, 'rb') as f:
            s3.put_object(Bucket=R2_BUCKET, Key=r2_key, Body=f)
        cur.execute(
            'UPDATE "EmployeeDocument" SET file_url = %s WHERE id = %s',
            (r2_key, doc_id),
        )
        conn.commit()
        print(f"  OK    {doc_id[:8]} → {r2_key}")
        migrated += 1
    except Exception as e:
        conn.rollback()
        print(f"  FAIL  {doc_id[:8]} — {e}")
        failed += 1

cur.close()
conn.close()
print(f"\nDone. Migrated: {migrated}, Failed: {failed}")
