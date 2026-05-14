import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neon, neonConfig } from '@neondatabase/serverless'

// Per-request client — CF Workers resets WebSocket connections between
// requests, which causes pool staleness. A new adapter per invocation
// prevents that. PrismaNeon's connect() is lazy so there's no upfront cost.
let _client: PrismaClient | null = null
let _sql: ReturnType<typeof neon> | null = null

export function initPrisma(databaseUrl: string): void {
  neonConfig.webSocketConstructor = WebSocket
  const adapter = new PrismaNeon({ connectionString: databaseUrl })
  _client = new PrismaClient({ adapter } as any)
  _sql = neon(databaseUrl)
}

export function getSql(): ReturnType<typeof neon> {
  if (!_sql) throw new Error('[neon] initPrisma not called.')
  return _sql
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!_client) throw new Error('[prisma] initPrisma not called.')
    return (_client as any)[prop]
  },
})

export const cache = {
  short: { ttl: 60, swr: 300 } as const,
  medium: { ttl: 300, swr: 3600 } as const,
  long: { ttl: 3600, swr: 7200 } as const,
}
