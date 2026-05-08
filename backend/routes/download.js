const express = require('express');
const router = express.Router();

const GITHUB_REPO = 'BeyondMedia01/Bantu-Cloud';
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

// Map our platform slugs to patterns in release asset filenames
const PLATFORM_MAP = {
  'macos-arm64': /Bantu_\d+\.\d+\.\d+_aarch64\.dmg$/,
  'macos-x64':   /Bantu_\d+\.\d+\.\d+_x64\.dmg$/,
  'windows-x64': /Bantu_\d+\.\d+\.\d+_x64-setup\.exe$/,
};

const headers = {};
const token = process.env.GITHUB_TOKEN;
if (token) headers.Authorization = `Bearer ${token}`;

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
      { headers, signal: controller.signal },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const releases = await res.json();
    for (const r of releases) {
      if (r.tag_name && r.tag_name.startsWith('desktop-v') && !r.draft) {
        return r;
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/desktop/download/:platform — redirect to the latest release asset
router.get('/download/:platform', async (req, res) => {
  const pattern = PLATFORM_MAP[req.params.platform];
  if (!pattern) {
    return res.status(400).json({ message: `Unknown platform: ${req.params.platform}. Valid: ${Object.keys(PLATFORM_MAP).join(', ')}` });
  }

  try {
    const release = await fetchLatestRelease();
    if (!release) {
      return res.status(404).json({ message: 'No desktop release found' });
    }

    const asset = release.assets.find(a => pattern.test(a.name));
    if (!asset) {
      return res.status(404).json({ message: `No asset found for platform: ${req.params.platform}` });
    }

    return res.redirect(302, asset.browser_download_url);
  } catch (err) {
    console.error('Download redirect failed, falling back to releases page:', err.message);
    return res.redirect(302, RELEASES_PAGE);
  }
});

module.exports = router;
