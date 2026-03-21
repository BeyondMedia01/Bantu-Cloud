// Re-export from lib/auth for backward compatibility.
// All new code should import from lib/auth directly.
const { authenticateToken, requireRole, getCurrentUser } = require('../lib/auth');
const { requirePermission } = require('../lib/permissions');

module.exports = { authenticateToken, requireRole, requirePermission, getCurrentUser };
