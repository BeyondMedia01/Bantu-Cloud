'use strict';

const express = require('express');
const https = require('https');
const router = express.Router();

const GITHUB_OWNER = 'BeyondMedia01';
const GITHUB_REPO = 'Bantu-Cloud';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const TAG_PREFIX = 'desktop-v';

// Map Tauri updater target/arch to GitHub release asset patterns
const PLATFORM_MAP = {
  'darwin-aarch64': {
    assetPattern: /_aarch64\.dmg$/,
    sigPattern: /_aarch64\.dmg\.sig$/,
  },
  'darwin-x86_64': {
    assetPattern: /_x64\.dmg$/,
    sigPattern: /_x64\.dmg\.sig$/,
  },
  'windows-x86_64': {
    assetPattern: /_x64-setup\.exe$/,
    sigPattern: /_x64-setup\.exe\.sig$/,
  },
};

let cachedManifest = null;
let cachedTag = null;

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`,
      headers: {
        'User-Agent': 'bantu-desktop-updater',
        Accept: 'application/vnd.github.v3+json',
        ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {}),
      },
    };
    https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

function fetchSignature(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname, headers: { 'User-Agent': 'bantu-desktop-updater' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        resolve(body.trim());
      });
    }).on('error', reject);
  });
}

function parseVersion(tag) {
  const v = tag.replace(TAG_PREFIX, '');
  const parts = v.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts;
}

function versionGt(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

router.get('/updates', async (req, res) => {
  try {
    const currentVersion = parseVersion(req.query.current_version || '0.0.0');
    if (!currentVersion) {
      return res.status(400).json({ error: 'Invalid current_version' });
    }

    // Check cache first
    if (cachedManifest && versionGt(parseVersion(cachedTag), currentVersion)) {
      return res.json(cachedManifest);
    }

    // Fetch latest release from GitHub
    let releases;
    try {
      releases = await githubGet('/releases?per_page=10');
    } catch (e) {
      // GitHub API unavailable — serve cached manifest if we have one
      if (cachedManifest && versionGt(parseVersion(cachedTag), currentVersion)) {
        return res.json(cachedManifest);
      }
      return res.status(204).end();
    }

    // Find the newest desktop-v* release that's newer than current version
    let latestRelease = null;
    let latestTag = null;
    let latestVersion = [0, 0, 0];

    for (const rel of releases) {
      if (!rel.tag_name || !rel.tag_name.startsWith(TAG_PREFIX)) continue;
      if (rel.draft) continue;
      const v = parseVersion(rel.tag_name);
      if (!v) continue;
      if (versionGt(v, latestVersion)) {
        latestVersion = v;
        latestRelease = rel;
        latestTag = rel.tag_name;
      }
    }

    if (!latestRelease || !versionGt(latestVersion, currentVersion)) {
      return res.status(204).end();
    }

    // Build platform manifest
    const platforms = {};

    for (const [key, patterns] of Object.entries(PLATFORM_MAP)) {
      const asset = latestRelease.assets.find(a => patterns.assetPattern.test(a.name));
      const sigAsset = latestRelease.assets.find(a => patterns.sigPattern.test(a.name));
      if (asset && sigAsset) {
        try {
          const signature = await fetchSignature(sigAsset.browser_download_url);
          platforms[key] = { url: asset.browser_download_url, signature };
        } catch (e) {
          console.error(`Failed to fetch signature for ${key}:`, e.message);
        }
      }
    }

    if (Object.keys(platforms).length === 0) {
      return res.status(204).end();
    }

    const manifest = {
      version: latestVersion.join('.'),
      notes: latestRelease.body || '',
      pub_date: latestRelease.published_at || new Date().toISOString(),
      platforms,
    };

    cachedManifest = manifest;
    cachedTag = latestTag;

    return res.json(manifest);
  } catch (err) {
    console.error('Updater error:', err);
    return res.status(204).end();
  }
});

module.exports = router;
