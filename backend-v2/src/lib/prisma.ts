import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neon } from '@neondatabase/serverless';

let _client: PrismaClient | null = null;

export function initPrisma(databaseUrl: string): void {
  if (_client) return;
  const sql = neon(databaseUrl);
  const adapter = new PrismaNeon(sql);
  _client = new PrismaClient({ adapter, log: ['error'] });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!_client) throw new Error('Prisma not initialized. Call initPrisma(DATABASE_URL) before handling requests.');
    return (_client as any)[prop];
  },
});
