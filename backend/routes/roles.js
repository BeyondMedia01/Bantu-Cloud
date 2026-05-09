const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../lib/auth');

// All routes require auth + CLIENT_ADMIN or PLATFORM_ADMIN
router.use(authenticateToken);
router.use(requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'));

// Ownership guard — resolves companyId from query, body, or role lookup (for /:id routes)
// PLATFORM_ADMIN bypasses; CLIENT_ADMIN must own the company via clientId
async function assertCompanyOwnership(req, res) {
  if (req.user.role === 'PLATFORM_ADMIN') return true;

  let companyId = req.body?.companyId || req.query?.companyId;

  // For /:id routes (PUT, DELETE) we need to look up the role's companyId
  if (!companyId && req.params.id) {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!role) { res.status(404).json({ message: 'Role not found' }); return false; }
    companyId = role.companyId;
  }

  if (!companyId) { res.status(400).json({ message: 'companyId is required' }); return false; }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
  if (!company || company.clientId !== req.user.clientId) {
    res.status(403).json({ message: 'Access denied' });
    return false;
  }
  return true;
}

// GET /api/roles?companyId=xxx — list roles for a company
router.get('/', async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    const roles = await prisma.role.findMany({
      where: { companyId },
      include: { permissions: true, _count: { select: { userRoles: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(roles);
  } catch (err) {
    console.error('GET /roles:', err);
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

// POST /api/roles — create a role with permissions
// Body: { companyId, name, description, permissions: [{ module, actions[] }] }
router.post('/', async (req, res) => {
  const { companyId, name, description, permissions = [] } = req.body;
  if (!companyId || !name) return res.status(400).json({ message: 'companyId and name are required' });
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    const role = await prisma.role.create({
      data: {
        companyId,
        name: name.trim(),
        description: description?.trim() || null,
        permissions: {
          create: permissions.map(({ module, actions }) => ({ module, actions })),
        },
      },
      include: { permissions: true },
    });
    res.status(201).json(role);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A role with that name already exists' });
    console.error('POST /roles:', err);
    res.status(500).json({ message: 'Failed to create role' });
  }
});

// PUT /api/roles/:id — update name, description, and permissions
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, permissions } = req.body;
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    const role = await prisma.$transaction(async (tx) => {
      if (permissions !== undefined) {
        await tx.roleModulePermission.deleteMany({ where: { roleId: id } });
        await tx.roleModulePermission.createMany({
          data: permissions.map(({ module, actions }) => ({ roleId: id, module, actions })),
        });
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(name && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
        },
        include: { permissions: true },
      });
    });
    res.json(role);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Role not found' });
    console.error('PUT /roles/:id:', err);
    res.status(500).json({ message: 'Failed to update role' });
  }
});

// DELETE /api/roles/:id
router.delete('/:id', async (req, res) => {
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ message: 'Role deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Role not found' });
    console.error('DELETE /roles/:id:', err);
    res.status(500).json({ message: 'Failed to delete role' });
  }
});

// GET /api/roles/users?companyId=xxx — list all users and their roles for a company
router.get('/users', async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    const assignments = await prisma.userCompanyRole.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { id: true, name: true } },
      },
    });

    // Group by user
    const byUser = {}
    for (const { user, role } of assignments) {
      if (!byUser[user.id]) byUser[user.id] = { ...user, roles: [] }
      byUser[user.id].roles.push(role)
    }
    res.json(Object.values(byUser));
  } catch (err) {
    console.error('GET /roles/users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// POST /api/roles/assign — assign roles to a user in a company
// Body: { userId, companyId, roleIds[] }
router.post('/assign', async (req, res) => {
  const { userId, companyId, roleIds } = req.body;
  if (!userId || !companyId || !Array.isArray(roleIds)) {
    return res.status(400).json({ message: 'userId, companyId, and roleIds[] are required' });
  }
  if (!await assertCompanyOwnership(req, res)) return;

  try {
    // Validate all roleIds belong to the target company
    const validRoles = await prisma.role.findMany({
      where: { id: { in: roleIds }, companyId },
      select: { id: true },
    });
    if (validRoles.length !== roleIds.length) {
      return res.status(400).json({ message: 'One or more roleIds are invalid for this company' });
    }

    // Remove existing assignments for this user+company, then recreate
    await prisma.$transaction(async (tx) => {
      await tx.userCompanyRole.deleteMany({ where: { userId, companyId } });
      await tx.userCompanyRole.createMany({
        data: roleIds.map((roleId) => ({ userId, companyId, roleId })),
      });
    });
    res.json({ message: 'Roles assigned' });
  } catch (err) {
    console.error('POST /roles/assign:', err);
    res.status(500).json({ message: 'Failed to assign roles' });
  }
});

module.exports = router;
