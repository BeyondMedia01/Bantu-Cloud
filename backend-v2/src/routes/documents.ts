import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import * as storage from '../lib/storage';
import { denyUnlessCompany } from '../lib/ownership';

const router = new Hono();

async function checkDocEmployeeAccess(c: any, employeeId: string): Promise<boolean> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
  if (!emp) return false;
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (companyId && emp.companyId !== companyId) return false;
  if (!companyId && !clientId) return false;
  return true;
}

router.get('/employee/:employeeId', async (c) => {
  const employeeId = c.req.param('employeeId');
  if (!(await checkDocEmployeeAccess(c, employeeId))) return c.json({ message: 'Access denied' }, 403);
  const docs = await prisma.employeeDocument.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
  });
  const docsWithUrls = await Promise.all(docs.map(async (doc) => {
    try {
      const downloadUrl = await storage.getSignedDownloadUrl(doc.fileUrl);
      return { ...doc, downloadUrl };
    } catch {
      return { ...doc, downloadUrl: null };
    }
  }));
  return c.json(docsWithUrls);
});

router.post('/upload', requirePermission('manage_employees'), async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File | undefined;
    const employeeId = body.employeeId as string;
    const type = (body.type as string) || 'OTHER';

    if (!file || !employeeId) {
      return c.json({ message: 'file and employeeId are required' }, 400);
    }

    if (!(await checkDocEmployeeAccess(c, employeeId))) return c.json({ message: 'Access denied' }, 403);

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `employees/${employeeId}/${Date.now()}-${file.name}`;

    await storage.upload(key, buffer, file.type);

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        name: file.name,
        fileUrl: key,
        type,
        size: buffer.length,
        mimeType: file.type,
      },
    });

    return c.json(doc, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Upload failed' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const doc = await prisma.employeeDocument.findUnique({
      where: { id: c.req.param('id') },
      include: { employee: { select: { companyId: true } } },
    });
    if (!doc) return c.json({ message: 'Document not found' }, 404);
    if (!denyUnlessCompany(c, { companyId: doc.employee.companyId })) return c.json({ message: 'Access denied' }, 403);

    await storage.deleteFile(doc.fileUrl);
    await prisma.employeeDocument.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Failed to delete document' }, 500);
  }
});

export default router;
