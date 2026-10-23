import type { PoolConfig } from 'pg'

type Environment = Record<string, string | undefined>
export type DatabaseTarget = 'runtime' | 'migration'
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function required(env: Environment, name: string): string {
  const value = env[name]
  if (!value) {
    throw new Error(`Missing database setting: ${name}`)
  }
  return value
}

export function checkRemoteDatabaseTargets(env: Environment = process.env) {
  if (!env.DATABASE_URL || !env.DIRECT_URL) throw new Error('Remote commands require DATABASE_URL and DIRECT_URL')
  const runtime = new URL(getDatabaseOptions('runtime', env).connectionString!)
  const migration = new URL(getDatabaseOptions('migration', env).connectionString!)
  if (runtime.hostname.replace(/-pooler(?=\.)/, '') !== migration.hostname || runtime.pathname !== migration.pathname || (runtime.port || '5432') !== (migration.port || '5432')) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same database')
  }
}

export function getDatabaseOptions(target: DatabaseTarget = 'runtime', env: Environment = process.env): PoolConfig {
  const max = Number(env.PG_POOL_MAX || (env.VERCEL === '1' ? 3 : 10))
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('PG_POOL_MAX must be between 1 and 20')
  const pool = { max, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, allowExitOnIdle: true }
  const key = target === 'migration' ? 'DIRECT_URL' : 'DATABASE_URL'
  const connectionString = env[key]
  if (!connectionString && (env.VERCEL === '1' || (target === 'migration' && env.DATABASE_URL))) {
    throw new Error(`Missing database setting: ${key}`)
  }
  if (connectionString) {
    let url: URL
    try { url = new URL(connectionString) } catch { throw new Error(`Invalid ${key}`) }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2 || url.hash) {
      throw new Error(`Invalid ${key}`)
    }
    if (target === 'migration' && url.hostname.includes('-pooler.')) throw new Error('DIRECT_URL must use a direct database endpoint')
    const sslmode = url.searchParams.get('sslmode')
    if (url.searchParams.getAll('sslmode').length > 1) throw new Error(`Ambiguous sslmode in ${key}`)
    const local = localHosts.has(url.hostname)
    if (sslmode && !['require', 'verify-full', 'disable'].includes(sslmode)) throw new Error(`Unsupported sslmode in ${key}`)
    if (!local && sslmode === 'disable') throw new Error(`TLS is required for ${key}`)
    // pg URL options override the explicit SSL config; do not permit weakened validation or local certificate paths.
    for (const option of ['ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
      if (url.searchParams.has(option)) throw new Error(`Unsupported TLS option in ${key}`)
    }
    const binding = url.searchParams.get('channel_binding')
    if (binding && !['require', 'prefer', 'disable'].includes(binding)) throw new Error(`Unsupported channel_binding in ${key}`)
    url.searchParams.delete('sslmode')
    url.searchParams.delete('channel_binding')
    return {
      ...pool,
      connectionString: url.href,
      ssl: local && !['require', 'verify-full'].includes(sslmode || '') ? false : { rejectUnauthorized: true },
      enableChannelBinding: binding === 'require' || binding === 'prefer'
    }
  }
  const port = Number(env.POSTGRES_PORT || 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be a valid TCP port')
  }

  return {
    ...pool,
    host: env.POSTGRES_HOST || '127.0.0.1',
    port,
    user: required(env, 'POSTGRES_USER'),
    password: required(env, 'POSTGRES_PASSWORD'),
    database: required(env, 'POSTGRES_DB'),
    ssl: localHosts.has(env.POSTGRES_HOST || '127.0.0.1') ? false : { rejectUnauthorized: true }
  }
}
