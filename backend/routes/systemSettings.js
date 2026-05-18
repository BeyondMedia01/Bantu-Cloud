const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../lib/auth');
const { requirePermission, requireModule } = require('../lib/permissions');
const { invalidateSettingsCache } = require('../lib/systemSettings');

const router = express.Router();
router.use(requireModule('SETTINGS'));

// All system settings routes require authentication
router.use(authenticateToken);

// Get all system settings
router.get('/', async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { settingName: 'asc' }
    });
    res.json(settings);
  } catch (error) {
    console.error('Failed to fetch system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// Create a new system setting
router.post('/', requirePermission('update_settings'), async (req, res) => {
  const {
    settingName,
    settingValue,
    dataType,
    effectiveFrom,
    isActive,
    description,
    lastUpdatedBy
  } = req.body;

  try {
    const newSetting = await prisma.systemSetting.create({
      data: {
        settingName,
        settingValue: String(settingValue),
        dataType: dataType || 'TEXT',
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        isActive: isActive !== undefined ? isActive : true,
        description,
        lastUpdatedBy,
      }
    });
    invalidateSettingsCache();
    res.status(201).json(newSetting);
  } catch (error) {
    console.error('Failed to create system setting:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A setting with this name and effective date already exists.' });
    }
    res.status(500).json({ error: 'Failed to create system setting' });
  }
});

// Update a system setting
router.patch('/:id', requirePermission('update_settings'), async (req, res) => {
  const { id } = req.params;

  const {
    settingValue,
    isActive,
    description,
  } = req.body;

  try {
    const existing = await prisma.systemSetting.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    const lastUpdatedBy = req.user?.email || req.user?.userId || 'system';

    const updatedSetting = await prisma.systemSetting.update({
      where: { id },
      data: {
        ...(settingValue !== undefined && { settingValue: String(settingValue) }),
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        lastUpdatedBy,
      }
    });
    invalidateSettingsCache();
    res.json(updatedSetting);
  } catch (error) {
    console.error('Failed to update system setting:', error);
    res.status(500).json({ error: 'Failed to update system setting' });
  }
});

// GET /api/system-settings/trade-union
router.get('/trade-union', async (req, res) => {
  try {
    const [empSetting, emprSetting] = await Promise.all([
      prisma.systemSetting.findFirst({ where: { settingName: 'TRADE_UNION_EMPLOYEE_RATE' } }),
      prisma.systemSetting.findFirst({ where: { settingName: 'TRADE_UNION_EMPLOYER_RATE' } }),
    ]);
    res.json({
      employeeRate: parseFloat(empSetting?.settingValue ?? '1'),
      employerRate: parseFloat(emprSetting?.settingValue ?? '1'),
    });
  } catch (error) {
    console.error('Failed to fetch trade union settings:', error);
    res.status(500).json({ error: 'Failed to fetch trade union settings' });
  }
});

// PUT /api/system-settings/trade-union
router.put('/trade-union', requirePermission('update_settings'), async (req, res) => {
  const { employeeRate, employerRate } = req.body;
  const lastUpdatedBy = req.user?.email || req.user?.userId || 'system';
  try {
    const [empSetting, emprSetting] = await Promise.all([
      prisma.systemSetting.findFirst({ where: { settingName: 'TRADE_UNION_EMPLOYEE_RATE' } }),
      prisma.systemSetting.findFirst({ where: { settingName: 'TRADE_UNION_EMPLOYER_RATE' } }),
    ]);
    const updates = [];
    if (empSetting) {
      updates.push(prisma.systemSetting.update({ where: { id: empSetting.id }, data: { settingValue: String(employeeRate), lastUpdatedBy } }));
    }
    if (emprSetting) {
      updates.push(prisma.systemSetting.update({ where: { id: emprSetting.id }, data: { settingValue: String(employerRate), lastUpdatedBy } }));
    }
    await Promise.all(updates);
    const { invalidateSettingsCache } = require('../lib/systemSettings');
    invalidateSettingsCache();
    res.json({ employeeRate, employerRate });
  } catch (error) {
    console.error('Failed to update trade union settings:', error);
    res.status(500).json({ error: 'Failed to update trade union settings' });
  }
});

// Delete a system setting
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.systemSetting.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    await prisma.systemSetting.delete({ where: { id } });
    invalidateSettingsCache();
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete system setting:', error);
    res.status(500).json({ error: 'Failed to delete system setting' });
  }
});

module.exports = router;
