const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const API = () => {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return { base: url.replace(/\/$/, ''), headers: { Authorization: `Bearer ${key}` } };
};

async function ensureBucket(name) {
  const { base, headers } = API();
  const res = await fetch(`${base}/storage/v1/bucket`, { headers });
  const buckets = await res.json();
  if (!buckets.find(b => b.name === name)) {
    const r = await fetch(`${base}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, public: false }),
    });
    if (!r.ok) throw new Error(`Failed to create bucket: ${r.status}`);
  }
}

async function uploadBuffer(bucket, path, buffer, contentType) {
  const { base, headers } = API();
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType || 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed: ${res.status} — ${err}`);
  }
}

async function listObjects(bucket, prefix = '') {
  const { base, headers } = API();
  const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!res.ok) throw new Error(`Supabase list failed: ${res.status}`);
  return res.json();
}

async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const { base, headers } = API();
  const res = await fetch(`${base}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Supabase signed URL failed: ${res.status}`);
  const { signedURL } = await res.json();
  return `${base}${signedURL}`;
}

module.exports = { ensureBucket, uploadBuffer, listObjects, getSignedUrl };
