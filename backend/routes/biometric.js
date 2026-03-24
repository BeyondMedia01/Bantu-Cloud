/**
 * biometric.js — Public webhook endpoints for biometric device push integration.
 *
 * These routes are mounted WITHOUT auth middleware (devices don't carry JWTs).
 * Authentication is done via:
 *   - ZKTeco ADMS:    ?SN=<serialNumber>&key=<webhookKey>  (device serial + secret)
 *   - Hikvision push: Authorization header or ?key=<webhookKey>
 *
 * ZKTeco ADMS flow:
 *   1. Device boots → GET /api/biometric/zkteco?SN=<serial>&options=all
 *      Server responds with options (timestamp, sync interval, etc.)
 *   2. Device sends attendance data → POST /api/biometric/zkteco?SN=<serial>&table=ATTLOG
 *      Body: plain text ATTLOG records (PIN\tDate\tStatus\t...)
 *      Server responds: OK
 *
 * Hikvision push flow:
 *   Device sends: POST /api/biometric/hikvision?key=<webhookKey>
 *   Body: XML EventNotificationAlert
 */

'use strict';

const express = require('express');
const prisma   = require('../lib/prisma');
const { parseAdmsPayload, buildAdmsAck, buildAdmsOptions } = require('../lib/zktecoClient');
const { parseHikvisionPush }                               = require('../lib/hikvisionClient');
const { matchEmployeeByPin }                               = require('../lib/attendanceEngine');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const checkEmployeeLifecycle = async (empId, punchTime) => {
  if (!empId) return true;
  const emp = await prisma.employee.findUnique({
    where: { id: empId },
    select: { startDate: true, dischargeDate: true }
  });
  if (!emp) return false;
  
  const pTime = new Date(punchTime);
  if (pTime < new Date(emp.startDate)) return false;
  if (emp.dischargeDate && pTime > new Date(emp.dischargeDate)) return false;
  
  return true;
};

// ─── ZKTeco ADMS — Device Handshake (GET) ─────────────────────────────────────

router.get('/zkteco', async (req, res) => {
  const { SN, options } = req.query;
  if (!SN) return res.status(400).send('SN required');

  // Find device by serial number
  const device = await prisma.biometricDevice.findFirst({ where: { serialNumber: SN, isActive: true } });
  if (!device) {
    // Unknown device — still respond so it doesn't keep retrying
    res.set('Content-Type', 'text/plain');
    return res.send(buildAdmsOptions(SN));
  }

  // Update last sync time
  await prisma.biometricDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });

  res.set('Content-Type', 'text/plain');
  res.send(buildAdmsOptions(SN));
});

// ─── ZKTeco ADMS — Attendance Push (POST) ─────────────────────────────────────

router.post('/zkteco', express.text({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const { SN, key } = req.query;
  if (!SN) return res.status(400).send('SN required');

  // Authenticate: require webhookKey matching the registered device secret
  const providedKey = key || req.headers['x-webhook-key'];
  const device = providedKey
    ? await prisma.biometricDevice.findFirst({ where: { serialNumber: SN, webhookKey: providedKey } })
    : null;
  if (!device) return res.status(401).send('Unauthorized');

  try {
    const { records } = parseAdmsPayload(typeof req.body === 'string' ? req.body : '', SN);

    let saved = 0;
    for (const r of records) {
      const companyId = device.companyId;
      if (!companyId) continue;

      const emp = await matchEmployeeByPin(prisma, companyId, r.deviceUserId);
      if (emp && !(await checkEmployeeLifecycle(emp.id, r.punchTime))) {
        console.warn(`[Biometric] Skipping log for ${emp.id}: punchTime ${r.punchTime} outside lifecycle`);
        continue;
      }

      try {
        await prisma.attendanceLog.create({
          data: {
            companyId,
            deviceId:     device.id,
            employeeId:   emp?.id     || null,
            deviceUserId: r.deviceUserId,
            punchTime:    r.punchTime,
            punchType:    r.punchType,
            source:       'DEVICE',
            rawPayload:   r.rawPayload || {},
          },
        });
        saved++;
      } catch { /* skip duplicate punches */ }
    }

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: `OK — ${saved} records` },
    });

    // ZKTeco ADMS protocol requires this specific response format
    res.set('Content-Type', 'text/plain');
    res.send(buildAdmsAck(SN));
  } catch (e) {
    console.error('ZKTeco ADMS error:', e.message);
    res.set('Content-Type', 'text/plain');
    res.send('ERROR\n');
  }
});

// ─── Hikvision Event Push ──────────────────────────────────────────────────────

router.post('/hikvision', express.text({ type: ['text/xml', 'application/xml', '*/*'], limit: '1mb' }), async (req, res) => {
  const key = req.headers['x-webhook-key'] || req.query.key;

  // Authenticate via webhookKey
  const device = key ? await prisma.biometricDevice.findFirst({ where: { webhookKey: key, vendor: 'HIKVISION', isActive: true } }) : null;

  try {
    const body = typeof req.body === 'string' ? req.body : '';
    const records = parseHikvisionPush(body);

    if (!device || records.length === 0) {
      return res.status(200).json({ ok: true, saved: 0 });
    }

    let saved = 0;
    for (const r of records) {
      const emp = await matchEmployeeByPin(prisma, device.companyId, r.deviceUserId);
      if (emp && !(await checkEmployeeLifecycle(emp.id, r.punchTime))) continue;

      try {
        await prisma.attendanceLog.create({
          data: {
            companyId:    device.companyId,
            deviceId:     device.id,
            employeeId:   emp?.id || null,
            deviceUserId: r.deviceUserId,
            punchTime:    r.punchTime,
            punchType:    r.punchType,
            source:       'HIKVISION',
            rawPayload:   r.rawPayload || {},
          },
        });
        saved++;
      } catch { /* duplicate */ }
    }

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data:  { lastSyncAt: new Date(), lastSyncStatus: `OK — ${saved} records` },
    });

    res.json({ ok: true, saved });
  } catch (e) {
    console.error('Hikvision push error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/biometric/import  — body: { companyId, logs: [{ pin, punchTime, punchType }] }
// Requires auth via header X-Webhook-Key or query ?apiKey=<webhookKey>

router.post('/import', express.json(), async (req, res) => {
  const key = req.headers['x-webhook-key'] || req.query.key || req.query.apiKey;
  if (!key) return res.status(401).json({ message: 'API key required' });

  const device = await prisma.biometricDevice.findFirst({ where: { webhookKey: key, isActive: true } });
  if (!device) return res.status(403).json({ message: 'Invalid key' });

  const { logs } = req.body;
  if (!Array.isArray(logs) || logs.length === 0) return res.status(400).json({ message: 'logs array is required' });

  let saved = 0;
  for (const l of logs) {
    if (!l.pin || !l.punchTime) continue;
    const punchTime = new Date(l.punchTime);
    if (isNaN(punchTime.getTime())) continue;

    const emp = await matchEmployeeByPin(prisma, device.companyId, String(l.pin));
    if (emp && !(await checkEmployeeLifecycle(emp.id, punchTime))) continue;

    try {
      await prisma.attendanceLog.create({
        data: {
          companyId:    device.companyId,
          deviceId:     device.id,
          employeeId:   emp?.id || null,
          deviceUserId: String(l.pin),
          punchTime,
          punchType:    l.punchType || 'IN',
          source:       'IMPORT',
          rawPayload:   l,
        },
      });
      saved++;
    } catch { /* duplicate */ }
  }

  res.json({ ok: true, saved });
});

module.exports = router;
