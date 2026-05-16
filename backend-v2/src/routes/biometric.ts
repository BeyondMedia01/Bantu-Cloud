import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parseAdmsPayload, buildAdmsAck, buildAdmsOptions } from '../lib/zktecoClient';
import { parseHikvisionPush } from '../lib/hikvisionClient';
import { matchEmployeeByPin } from '../lib/attendanceEngine';
import { validateBody } from '../lib/validate';

const ImportLogsSchema = z.object({
  logs: z.array(z.object({
    pin: z.union([z.string(), z.number()]),
    punchTime: z.string().min(1),
    punchType: z.string().optional(),
  })).min(1),
});

const router = new Hono();

async function checkEmployeeLifecycle(empId: string | null, punchTime: Date): Promise<boolean> {
  if (!empId) return true;
  const emp = await prisma.employee.findUnique({
    where: { id: empId },
    select: { startDate: true, dischargeDate: true },
  });
  if (!emp) return false;
  if (punchTime < new Date(emp.startDate)) return false;
  if (emp.dischargeDate && punchTime > new Date(emp.dischargeDate)) return false;
  return true;
}

router.get('/zkteco', async (c) => {
  const SN = c.req.query('SN');
  if (!SN) return c.text('SN required', 400);

  const device = await prisma.biometricDevice.findFirst({ where: { serialNumber: SN, isActive: true } });
  if (device) {
    await prisma.biometricDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
  }

  c.header('Content-Type', 'text/plain');
  return c.text(buildAdmsOptions(SN));
});

router.post('/zkteco', async (c) => {
  const SN = c.req.query('SN');
  const key = c.req.query('key');
  if (!SN) return c.text('SN required', 400);

  const providedKey = key || c.req.header('x-webhook-key');
  const device = providedKey
    ? await prisma.biometricDevice.findFirst({ where: { serialNumber: SN, webhookKey: providedKey } })
    : null;
  if (!device) return c.text('Unauthorized', 401);

  try {
    const body = await c.req.text();
    const { records } = parseAdmsPayload(body, SN);

    let saved = 0;
    for (const r of records) {
      const companyId = device.companyId;
      if (!companyId) continue;

      const emp = await matchEmployeeByPin(companyId, r.deviceUserId);
      if (emp && !(await checkEmployeeLifecycle(emp.id, r.punchTime))) {
        console.warn(`[Biometric] Skipping log for ${emp.id}: punchTime ${r.punchTime} outside lifecycle`);
        continue;
      }

      try {
        await prisma.attendanceLog.create({
          data: {
            companyId,
            deviceId: device.id,
            employeeId: emp?.id || null,
            deviceUserId: r.deviceUserId,
            punchTime: r.punchTime,
            punchType: r.punchType,
            source: 'DEVICE',
            rawPayload: r.rawPayload as any,
          },
        });
        saved++;
      } catch (err: any) {
        console.warn('Skipping duplicate ZKTeco punch:', r.deviceUserId, r.punchTime, err.message);
      }
    }

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: `OK — ${saved} records` },
    });

    c.header('Content-Type', 'text/plain');
    return c.text(buildAdmsAck(SN));
  } catch (e: any) {
    console.error('ZKTeco ADMS error:', e.message);
    c.header('Content-Type', 'text/plain');
    return c.text('ERROR\n', 500);
  }
});

router.post('/hikvision', async (c) => {
  const key = c.req.header('x-webhook-key') || c.req.query('key');

  const device = key
    ? await prisma.biometricDevice.findFirst({ where: { webhookKey: key, vendor: 'HIKVISION', isActive: true } })
    : null;

  if (!device) return c.json({ ok: false, error: 'Invalid or missing webhook key' }, 401);

  try {
    const body = await c.req.text();
    const records = parseHikvisionPush(body);

    if (records.length === 0) {
      return c.json({ ok: true, saved: 0 });
    }

    let saved = 0;
    for (const r of records) {
      const emp = await matchEmployeeByPin(device.companyId, r.deviceUserId);
      if (emp && !(await checkEmployeeLifecycle(emp.id, r.punchTime))) continue;

      try {
        await prisma.attendanceLog.create({
          data: {
            companyId: device.companyId,
            deviceId: device.id,
            employeeId: emp?.id || null,
            deviceUserId: r.deviceUserId,
            punchTime: r.punchTime,
            punchType: r.punchType,
            source: 'HIKVISION',
            rawPayload: r.rawPayload as any,
          },
        });
        saved++;
      } catch (err: any) {
        console.warn('Skipping duplicate Hikvision punch:', r.deviceUserId, r.punchTime, err.message);
      }
    }

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: `OK — ${saved} records` },
    });

    return c.json({ ok: true, saved });
  } catch (e: any) {
    console.error('Hikvision push error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

router.post('/import', async (c) => {
  const key = c.req.header('x-webhook-key') || c.req.query('key') || c.req.query('apiKey');
  if (!key) return c.json({ message: 'API key required' }, 401);

  const device = await prisma.biometricDevice.findFirst({ where: { webhookKey: key, isActive: true } });
  if (!device) return c.json({ message: 'Invalid key' }, 403);

  try {
    const result = ImportLogsSchema.safeParse(await c.req.json());
    if (!result.success) return c.json({ message: result.error.errors[0].message }, 400);
    const { logs } = result.data;

    let saved = 0;
    for (const l of logs) {
      if (!l.pin || !l.punchTime) continue;
      const punchTime = new Date(l.punchTime);
      if (isNaN(punchTime.getTime())) continue;

      const emp = await matchEmployeeByPin(device.companyId, String(l.pin));
      if (emp && !(await checkEmployeeLifecycle(emp.id, punchTime))) continue;

      try {
        await prisma.attendanceLog.create({
          data: {
            companyId: device.companyId,
            deviceId: device.id,
            employeeId: emp?.id || null,
            deviceUserId: String(l.pin),
            punchTime,
            punchType: l.punchType || 'IN',
            source: 'IMPORT',
            rawPayload: l,
          },
        });
        saved++;
      } catch (err: any) {
        console.warn('Skipping duplicate import punch:', l.pin, l.punchTime, err.message);
      }
    }

    return c.json({ ok: true, saved });
  } catch (e: any) {
    console.error('Biometric import error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

export default router;
