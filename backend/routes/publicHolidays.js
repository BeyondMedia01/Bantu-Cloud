const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const { buildZimbabweHolidays } = require('../utils/holidays');

// ─── GET /api/public-holidays ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const holidays = await prisma.publicHoliday.findMany({
      where: { year, country: 'ZW' },
      orderBy: { date: 'asc' },
    });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load holidays' });
  }
});

// ─── POST /api/public-holidays/seed ──────────────────────────────────────────

router.post('/seed', requirePermission('update_settings'), async (req, res) => {
  try {
    const year = req.body.year ? parseInt(req.body.year) : new Date().getFullYear();
    const holidays = buildZimbabweHolidays(year);

    let created = 0;
    let skipped = 0;

    for (const h of holidays) {
      const existing = await prisma.publicHoliday.findFirst({
        where: { date: h.date, country: h.country },
      });
      if (existing) { skipped++; continue; }
      await prisma.publicHoliday.create({ data: h });
      created++;
    }

    res.json({ message: `Seeded ${created} holidays for ${year} (${skipped} already existed)`, created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to seed holidays' });
  }
});

// ─── POST /api/public-holidays ────────────────────────────────────────────────

router.post('/', requirePermission('update_settings'), async (req, res) => {
  try {
    const { name, date } = req.body;
    if (!name || !date) return res.status(400).json({ message: 'name and date are required' });
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const holiday = await prisma.publicHoliday.create({
      data: { name, date: d, year, country: 'ZW' },
    });
    res.status(201).json(holiday);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A holiday already exists on this date' });
    res.status(500).json({ message: 'Failed to create holiday' });
  }
});

// ─── DELETE /api/public-holidays/:id ─────────────────────────────────────────
// Public holidays are global (not per-client), so only PLATFORM_ADMIN may delete them.

router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    // Only PLATFORM_ADMIN may delete global public holiday records
    if (req.user.role !== 'PLATFORM_ADMIN') {
      return res.status(403).json({ message: 'Only platform administrators can delete public holidays' });
    }
    const holiday = await prisma.publicHoliday.findUnique({ where: { id: req.params.id } });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    await prisma.publicHoliday.delete({ where: { id: req.params.id } });
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Holiday not found' });
    res.status(500).json({ message: 'Failed to delete holiday' });
  }
});

module.exports = router;
