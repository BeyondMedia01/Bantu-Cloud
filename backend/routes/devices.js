const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { pullAttendanceTCP }               = require('../lib/zktecoClient');
const { fetchAttendanceEvents, getDeviceInfo } = require('../lib/hikvisionClient');
const { matchEmployeeByPin }              = require('../lib/attendanceEngine');

const router = express.Router();

// ─── GET /api/devices ────────────────────────────────────────────────────────

router.get('/', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  try {
    const devices = await prisma.biometricDevice.findMany({
      where:   { companyId: req.companyId },
      include: { _count: { select: { logs: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(devices.map((d) => ({ ...d, password: d.password ? '••••' : null })));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── GET /api/devices/:id ────────────────────────────────────────────────────

router.get('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const device = await prisma.biometricDevice.findUnique({ where: { id: req.params.id } });
    if (!device || (req.companyId && device.companyId !== req.companyId)) return res.status(404).json({ message: 'Device not found' });
    res.json({ ...device, password: device.password ? '••••' : null });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/devices ───────────────────────────────────────────────────────

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { name, vendor, model, ipAddress, port, serialNumber, location, username, password } = req.body;
  if (!name || !vendor) return res.status(400).json({ message: 'name and vendor are required' });
  try {
    const crypto = require('crypto');
    const device = await prisma.biometricDevice.create({
      data: {
        companyId:    req.companyId,
        name,
        vendor:       vendor.toUpperCase(),
        model:        model        || null,
        ipAddress:    ipAddress    || null,
        port:         port         ? parseInt(port) : 4370,
        serialNumber: serialNumber || null,
        location:     location     || null,
        username:     username     || null,
        password:     password     || null,
        webhookKey:   crypto.randomBytes(16).toString('hex'),
      },
    });
    res.status(201).json({ ...device, password: device.password ? '••••' : null });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── PUT /api/devices/:id ────────────────────────────────────────────────────

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.biometricDevice.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Device not found' });
    const { name, vendor, model, ipAddress, port, serialNumber, location, username, password, isActive } = req.body;
    const updated = await prisma.biometricDevice.update({
      where: { id: req.params.id },
      data: {
        ...(name         !== undefined && { name }),
        ...(vendor       !== undefined && { vendor: vendor.toUpperCase() }),
        ...(model        !== undefined && { model }),
        ...(ipAddress    !== undefined && { ipAddress }),
        ...(port         !== undefined && { port: parseInt(port) }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(location     !== undefined && { location }),
        ...(username     !== undefined && { username }),
        // Only update password if a new one is provided (not the masked "••••")
        ...(password && password !== '••••' && { password }),
        ...(isActive     !== undefined && { isActive: isActive === true || isActive === 'true' }),
      },
    });
    res.json({ ...updated, password: updated.password ? '••••' : null });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── DELETE /api/devices/:id ─────────────────────────────────────────────────

router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.biometricDevice.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Device not found' });
    await prisma.biometricDevice.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/devices/:id/sync — pull attendance logs from device ────────────

router.post('/:id/sync', requirePermission('manage_employees'), async (req, res) => {
  try {
    const device = await prisma.biometricDevice.findUnique({ where: { id: req.params.id } });
    if (!device || (req.companyId && device.companyId !== req.companyId)) return res.status(404).json({ message: 'Device not found' });
    if (!device.ipAddress) return res.status(400).json({ message: 'Device has no IP address configured' });

    const since = device.lastSyncAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date();
    let rawRecords = [];

    if (device.vendor === 'ZKTECO') {
      rawRecords = await pullAttendanceTCP(device.ipAddress, device.port || 4370);
    } else if (device.vendor === 'HIKVISION') {
      rawRecords = await fetchAttendanceEvents(device, since, until);
    } else {
      return res.status(400).json({ message: 'Direct sync not supported for this vendor. Configure ADMS push instead.' });
    }

    // Only include records newer than last sync
    const filtered = rawRecords.filter((r) => new Date(r.punchTime) >= since);

    let saved = 0;
    for (const r of filtered) {
      const emp = await matchEmployeeByPin(prisma, req.companyId, r.deviceUserId);
      try {
        await prisma.attendanceLog.create({
          data: {
            companyId:    req.companyId,
            deviceId:     device.id,
            employeeId:   emp?.id || null,
            deviceUserId: r.deviceUserId,
            punchTime:    r.punchTime,
            punchType:    r.punchType,
            source:       r.source || 'DEVICE',
            rawPayload:   r.rawPayload || {},
          },
        });
        saved++;
      } catch { /* skip duplicate punches */ }
    }

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data:  { lastSyncAt: until, lastSyncStatus: `OK — ${saved} records imported` },
    });

    res.json({ message: `Sync complete — ${saved} new records`, saved });
  } catch (e) {
    console.error('Device sync error:', e);
    await prisma.biometricDevice.update({
      where: { id: req.params.id },
      data:  { lastSyncStatus: `ERROR: ${e.message}` },
    }).catch(() => {});
    res.status(500).json({ message: `Sync failed: ${e.message}` });
  }
});

// ─── POST /api/devices/:id/test — connectivity test ──────────────────────────

router.post('/:id/test', requirePermission('manage_employees'), async (req, res) => {
  try {
    const device = await prisma.biometricDevice.findUnique({ where: { id: req.params.id } });
    if (!device || (req.companyId && device.companyId !== req.companyId)) return res.status(404).json({ message: 'Device not found' });
    if (!device.ipAddress) return res.status(400).json({ message: 'No IP configured' });

    if (device.vendor === 'HIKVISION') {
      const info = await getDeviceInfo(device);
      return res.json({ success: true, info });
    }

    // ZKTeco: basic TCP connect test
    const net = require('net');
    await new Promise((resolve, reject) => {
      const sock = net.connect(device.port || 4370, device.ipAddress, () => { sock.destroy(); resolve(); });
      sock.setTimeout(5000, () => { sock.destroy(); reject(new Error('Timed out')); });
      sock.on('error', reject);
    });
    res.json({ success: true, message: `Device at ${device.ipAddress}:${device.port || 4370} is reachable` });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;
