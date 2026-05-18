const prisma = require('../lib/prisma');

/**
 * Resolves and validates company context.
 *
 * For PLATFORM_ADMIN: blocks access to any company-scoped data (privacy boundary).
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

  // PLATFORM_ADMIN manages platform infrastructure only — ignore any x-company-id header.
  if (role === 'PLATFORM_ADMIN') {
    req.companyId = null;
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

    if (role === 'COMPANY_USER') {
      const clientIdFromToken = req.user.clientId;
      if (!clientIdFromToken) return res.status(403).json({ message: 'Access denied' });

      // Verify the company belongs to the user's client
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
      if (!company || company.clientId !== clientIdFromToken) {
        return res.status(403).json({ message: 'Access denied: company does not belong to your client' });
      }

      // Verify the user is actually assigned to this specific company via a role
      const assignment = await prisma.userCompanyRole.findFirst({
        where: { userId, companyId },
      });
      if (!assignment) {
        return res.status(403).json({ message: 'Access denied: not assigned to this company' });
      }

      req.companyId = companyId;
      req.clientId = clientIdFromToken;
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
