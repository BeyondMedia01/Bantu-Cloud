const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../lib/auth');
const { requirePermission } = require('../lib/permissions');

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
    lastUpdatedBy
  } = req.body;

  try {
    const existing = await prisma.systemSetting.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    const updatedSetting = await prisma.systemSetting.update({
      where: { id },
      data: {
        ...(settingValue !== undefined && { settingValue: String(settingValue) }),
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        ...(lastUpdatedBy !== undefined && { lastUpdatedBy }),
      }
    });
    res.json(updatedSetting);
  } catch (error) {
    console.error('Failed to update system setting:', error);
    res.status(500).json({ error: 'Failed to update system setting' });
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
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete system setting:', error);
    res.status(500).json({ error: 'Failed to delete system setting' });
  }
});

module.exports = router;
