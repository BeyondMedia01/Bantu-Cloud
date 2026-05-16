const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { payrollQueue, emailQueue, notifyQueue } = require('../queues/index');
const { verifyToken } = require('../lib/auth');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(payrollQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(notifyQueue),
  ],
  serverAdapter,
});

function requirePlatformAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const user = verifyToken(token);
    if (user.role !== 'PLATFORM_ADMIN') {
      return res.status(403).json({ message: 'Platform admin access required' });
    }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { bullBoardRouter: serverAdapter.getRouter(), requirePlatformAdmin };
