const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');
const { resolvePermissions } = require('./permissions.js');

const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is not set or is shorter than 32 characters. Refusing to start.');
  process.exit(1);
}

const signToken = async (payload) => {
  const sessionId = crypto.randomUUID();

  if (payload.role === 'COMPANY_USER' && payload.companyId) {
    payload.permissions = await resolvePermissions(payload.userId, payload.companyId);
    payload.isClientAdmin = false;
  } else {
    payload.isClientAdmin = payload.role === 'CLIENT_ADMIN' || payload.role === 'PLATFORM_ADMIN';
  }

  const token = jwt.sign({ ...payload, sessionId }, SECRET, {
    expiresIn: '8h',
    algorithm: 'HS256',
  });

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
  // Always verify the signature — no bypass, no exceptions.
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
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

    // Always verify session is still active in DB
    const session = await prisma.session.findUnique({
      where: { id: decoded.sessionId },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Session expired or invalidated' });
    }

    if (decoded.role === 'COMPANY_USER' && decoded.companyId) {
      decoded.permissions = await resolvePermissions(decoded.userId, decoded.companyId);
    }

    decoded.isClientAdmin = decoded.role === 'CLIENT_ADMIN' || decoded.role === 'PLATFORM_ADMIN';

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
