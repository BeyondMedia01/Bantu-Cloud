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
      const clientIdFromToken = req.user.clientId;
      if (!clientIdFromToken) {
        // Fallback for tokens issued before this change
        const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
        if (!ca) return res.status(403).json({ message: 'Client admin record not found' });
        req.clientId = ca.clientId;
      } else {
        req.clientId = clientIdFromToken;
      }

      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
      if (!company || company.clientId !== req.clientId) {
        return res.status(403).json({ message: 'Access denied: company does not belong to your client' });
      }

      req.companyId = companyId;
      return next();
    }

    if (role === 'EMPLOYEE') {
      const tokenCompanyId = req.user.companyId;
      if (tokenCompanyId && tokenCompanyId !== companyId) {
        return res.status(403).json({ message: 'Access denied: not your company' });
      }
      if (!tokenCompanyId) {
        // Fallback for tokens issued before this change
        const emp = await prisma.employee.findUnique({ where: { userId } });
        if (!emp || emp.companyId !== companyId) {
          return res.status(403).json({ message: 'Access denied: not your company' });
        }
        req.clientId = emp.clientId;
        req.employeeId = emp.id;
      } else {
        req.clientId = req.user.clientId;
        req.employeeId = req.user.employeeId;
      }

      req.companyId = companyId;
      return next();
    }

    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    next(error);
  }
};

module.exports = companyContext;
