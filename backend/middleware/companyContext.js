const prisma = require('../lib/prisma');

/**
 * Resolves and validates company context.
 *
 * For PLATFORM_ADMIN: sets req.companyId but skips ownership verification.
 * For CLIENT_ADMIN / EMPLOYEE: verifies the requested companyId belongs to
 * their client before allowing access.
 *
 * Must run AFTER authenticateToken.
 */
const companyContext = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const companyId = req.headers['x-company-id'];

  if (!companyId) {
    req.companyId = null;
    if (req.user && req.user.clientId) {
      req.clientId = req.user.clientId;
    }
    return next();
  }

  const { role, userId } = req.user;

  // Guard: token missing userId means it's an old/malformed token — force re-login
  if (!userId && role !== 'PLATFORM_ADMIN') {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }

  // PLATFORM_ADMIN can access any company; resolve clientId if provided to support filters
  if (role === 'PLATFORM_ADMIN') {
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company) req.clientId = company.clientId;
    }
    req.companyId = companyId;
    return next();
  }

  try {
    if (role === 'CLIENT_ADMIN') {
      const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
      if (!ca) return res.status(403).json({ message: 'Client admin record not found' });

      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company || company.clientId !== ca.clientId) {
        return res.status(403).json({ message: 'Access denied: company does not belong to your client' });
      }

      req.companyId = companyId;
      req.clientId = ca.clientId;
      return next();
    }

    if (role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId } });
      if (!emp || emp.companyId !== companyId) {
        return res.status(403).json({ message: 'Access denied: not your company' });
      }

      req.companyId = companyId;
      req.clientId = emp.clientId;
      req.employeeId = emp.id;
      return next();
    }

    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    next(error);
  }
};

module.exports = companyContext;
