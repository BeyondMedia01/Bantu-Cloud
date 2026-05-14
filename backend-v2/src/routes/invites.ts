import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }
function token() { return crypto.randomUUID(); }

async function assertCompanyOwnership(c: any, companyId: string): Promise<boolean> {
  const user = c.get('user');
  if (user.role === 'PLATFORM_ADMIN') return true;
  const clientId = c.get('clientId');
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { clientId: true },
  });
  if (!company || company.clientId !== clientId) return false;
  return true;
}

const createInviteSchema = z.object({
  companyId: z.string().min(1),
  email: z.string().email(),
  roleIds: z.array(z.string()).min(1),
});

router.get('/', async (c) => {
  const companyId = c.req.query('companyId');
  if (!companyId) return c.json({ message: 'companyId is required' }, 400);
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  const invites = await prisma.invite.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(invites);
});

router.post('/', requirePermission('manage_companies'), validateBody(createInviteSchema), async (c) => {
  const { companyId, email, roleIds } = c.req.valid('json');
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  const validRoles = await prisma.role.findMany({
    where: { id: { in: roleIds }, companyId },
    select: { id: true },
  });
  if (validRoles.length !== roleIds.length) {
    return c.json({ message: 'One or more roleIds are invalid for this company' }, 400);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invite.updateMany({
    where: { companyId, email: email.toLowerCase().trim(), status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });

  const user = c.get('user');
  const invite = await prisma.invite.create({
    data: {
      id: uuid(),
      Company: { connect: { id: companyId } },
      email: email.toLowerCase().trim(),
      roleIds,
      token: token(),
      invitedBy: user.userId,
      expiresAt,
      updatedAt: new Date(),
    },
  });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  const frontendUrl = (c as any).env?.FRONTEND_URL || 'https://payroll.thinkbantu.com';
  const inviteUrl = `${frontendUrl}/accept-invite?token=${invite.token}`;
  const { sendEmployeeInvite } = await import('../lib/mailer');
  await sendEmployeeInvite(invite.email, inviteUrl, company?.name || 'your company');

  return c.json({ message: 'Invite sent', inviteId: invite.id }, 201);
});

router.delete('/:id', async (c) => {
  const { id } = c.req.param();

  const invite = await prisma.invite.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!invite) return c.json({ message: 'Invite not found' }, 404);
  if (!await assertCompanyOwnership(c, invite.companyId)) return c.json({ message: 'Access denied' }, 403);

  await prisma.invite.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
  return c.json({ message: 'Invite cancelled' });
});

export default router;
