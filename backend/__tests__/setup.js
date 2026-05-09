// Global test setup — provide dummy env vars required by backend modules
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
// Skip JWT signature verification and session DB lookup in tests (mirrors desktop mode)
process.env.AUTH_SKIP_VERIFY = process.env.AUTH_SKIP_VERIFY || 'true';
