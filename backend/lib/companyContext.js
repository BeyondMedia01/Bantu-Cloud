const prisma = require('./prisma');

/**
 * Resolve the active Company for a user, based on their role.
 * - PLATFORM_ADMIN → first company in the system
 * - CLIENT_ADMIN   → first company under their client
 * - EMPLOYEE       → company from their employee record
 */
const getCompanyForUser = async (userId, role) => {
  if (role === 'PLATFORM_ADMIN') {
    return prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  if (role === 'CLIENT_ADMIN') {
    const ca = await prisma.clientAdmin.findUnique({
      where: { userId },
      include: { client: { include: { companies: { orderBy: { createdAt: 'asc' }, take: 1 } } } },
    });
    return ca?.client?.companies?.[0] ?? null;
  }

  if (role === 'EMPLOYEE') {
    const emp = await prisma.employee.findUnique({ where: { userId } });
    if (!emp) return null;
    return prisma.company.findUnique({ where: { id: emp.companyId } });
  }

  return null;
};

/**
 * Get the clientId for a user based on their role.
 */
const getClientIdForUser = async (userId, role) => {
  if (role === 'PLATFORM_ADMIN') return null; // has access to all

  if (role === 'CLIENT_ADMIN') {
    const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
    return ca?.clientId ?? null;
  }

  if (role === 'EMPLOYEE') {
    const emp = await prisma.employee.findUnique({ where: { userId } });
    return emp?.clientId ?? null;
  }

  return null;
};

module.exports = { getCompanyForUser, getClientIdForUser };
