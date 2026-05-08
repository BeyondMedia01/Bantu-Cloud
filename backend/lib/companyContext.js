const prisma = require('./prisma');

/**
 * Resolve the active Company for a user, based on their role.
 * - PLATFORM_ADMIN → first company in the system
 * - CLIENT_ADMIN   → first company under their client
 * - EMPLOYEE       → company from their employee record
 */
const getCompanyForUser = async (userId, role) => {
  try {
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
  } catch (error) {
    console.error('[companyContext] getCompanyForUser failed:', error);
    throw error;
  }
};

/**
 * Get the clientId for a user based on their role.
 */
const getClientIdForUser = async (userId, role) => {
  try {
    if (role === 'PLATFORM_ADMIN') return null;

    if (role === 'CLIENT_ADMIN') {
      const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
      return ca?.clientId ?? null;
    }

    if (role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId } });
      return emp?.clientId ?? null;
    }

    return null;
  } catch (error) {
    console.error('[companyContext] getClientIdForUser failed:', error);
    throw error;
  }
};

module.exports = { getCompanyForUser, getClientIdForUser };
