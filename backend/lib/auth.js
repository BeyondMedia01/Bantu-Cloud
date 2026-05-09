const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');
const { resolvePermissions } = require('./permissions.js');

const SKIP_VERIFY = process.env.AUTH_SKIP_VERIFY === 'true';
const SECRET = SKIP_VERIFY ? 'desktop-dummy-secret' : process.env.JWT_SECRET;

if (!SECRET && !SKIP_VERIFY) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const signToken = async (payload) => {
  const sessionId = crypto.randomUUID();

  // Resolve permissions for COMPANY_USER so the frontend JWT decode
  // has access to them (the backend re-resolves on each request).
  if (payload.role === 'COMPANY_USER' && payload.companyId) {
    payload.permissions = await resolvePermissions(payload.userId, payload.companyId);
    payload.isClientAdmin = false;
  } else {
    payload.isClientAdmin = payload.role === 'CLIENT_ADMIN' || payload.role === 'PLATFORM_ADMIN';
  }

  const token = jwt.sign({ ...payload, sessionId }, SECRET, { expiresIn: '8h' });

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: payload.userId,
      token,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });

  return token;
};

const verifyToken = (token) => {
  if (SKIP_VERIFY) {
    // Desktop mode: trust cloud-issued JWTs without verifying signature.
    // The sidecar runs on the user's own machine, so this is acceptable.
    const decoded = jwt.decode(token);
    if (!decoded) throw new Error('Malformed token');
    return decoded;
  }
  return jwt.verify(token, SECRET);
};

/**
 * Express middleware — verifies Bearer JWT and sets req.user.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = verifyToken(token);

    if (!SKIP_VERIFY) {
      // Cloud mode: verify session is still active in DB
      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId }
      });

      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ message: 'Session expired or invalidated' });
      }
    }

    // Attach dynamic permissions for COMPANY_USER role
    if (decoded.role === 'COMPANY_USER' && decoded.companyId) {
      decoded.permissions = await resolvePermissions(decoded.userId, decoded.companyId)
    }

    // CLIENT_ADMIN and PLATFORM_ADMIN bypass all module checks
    decoded.isClientAdmin = decoded.role === 'CLIENT_ADMIN' || decoded.role === 'PLATFORM_ADMIN'

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Middleware factory — requires one of the given roles.
 * Must be used after authenticateToken.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Access denied: requires role ${roles.join(' or ')}` });
  }
  next();
};

const getCurrentUser = (req) => req.user ?? null;

module.exports = { signToken, verifyToken, authenticateToken, requireRole, getCurrentUser };
