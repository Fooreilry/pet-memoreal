import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { checkRemoteDatabaseTargets, getDatabaseOptions } from '../../server/db/config'
import { getAuthConfig } from '../../server/utils/auth-config'
import { getTrustedClientIP } from '../../server/utils/client-ip'
import { getMailTransportOptions } from '../../server/utils/mail'

const local = { POSTGRES_USER: 'local', POSTGRES_PASSWORD: 'local-only', POSTGRES_DB: 'local' }
const remote = {
  DATABASE_URL: 'postgresql://demo:fake-password@ep-demo-pooler.eu-central-1.aws.neon.tech/demo?sslmode=require&channel_binding=require',
  DIRECT_URL: 'postgresql://demo:fake-password@ep-demo.eu-central-1.aws.neon.tech/demo?sslmode=require&channel_binding=require',
  VERCEL: '1'
}

test('Neon runtime uses pooled URL, verified TLS and a bounded pool; migration selects direct URL', () => {
  const runtime = getDatabaseOptions('runtime', remote)
  assert.equal(runtime.max, 3)
  assert.deepEqual(runtime.ssl, { rejectUnauthorized: true })
  assert.equal(runtime.enableChannelBinding, true)
  assert.match(runtime.connectionString!, /-pooler\./)
  assert.doesNotMatch(runtime.connectionString!, /sslmode/)
  // Confirm pg's own URL parser cannot overwrite the verified TLS options.
  const client = new pg.Client(runtime)
  assert.deepEqual(client.ssl, { rejectUnauthorized: true })
  assert.doesNotMatch(getDatabaseOptions('migration', remote).connectionString!, /-pooler\./)
  assert.equal(getDatabaseOptions('runtime', local).database, 'local')
  assert.equal(getDatabaseOptions('migration', local).ssl, false)
  checkRemoteDatabaseTargets(remote)
  assert.throws(() => checkRemoteDatabaseTargets({ ...remote, DIRECT_URL: remote.DIRECT_URL.replace('ep-demo.', 'ep-other.') }), /same database/)
})

test('database configuration rejects unsafe or missing cloud settings without exposing credentials', () => {
  assert.throws(() => getDatabaseOptions('runtime', { ...local, VERCEL: '1' }), /DATABASE_URL/)
  assert.throws(() => getDatabaseOptions('migration', { ...remote, DIRECT_URL: '' }), /DIRECT_URL/)
  assert.throws(() => getDatabaseOptions('migration', { ...remote, DIRECT_URL: remote.DATABASE_URL }), /direct database endpoint/)
  for (const value of ['not-a-url-secret', 'https://user:secret@example.com/db', `${remote.DATABASE_URL}&sslmode=disable`, `${remote.DATABASE_URL}&ssl=no-verify`]) {
    assert.throws(() => getDatabaseOptions('runtime', { ...remote, DATABASE_URL: value }), error => error instanceof Error && !error.message.includes('secret') && !error.message.includes('fake-password'))
  }
  assert.throws(() => getDatabaseOptions('runtime', { ...local, PG_POOL_MAX: '0' }), /PG_POOL_MAX/)
})

test('client-provided IP headers are ignored outside Vercel; Vercel ingress takes precedence', () => {
  const headers = new Headers({ 'x-vercel-forwarded-for': '198.51.100.10', 'x-forwarded-for': '198.51.100.20', 'x-auth-client-ip': '198.51.100.30' })
  assert.equal(getTrustedClientIP(headers, '127.0.0.1', false), '127.0.0.1')
  assert.equal(getTrustedClientIP(headers, '127.0.0.1', true), '198.51.100.10')
  headers.set('x-vercel-forwarded-for', 'invalid, 198.51.100.10')
  assert.equal(getTrustedClientIP(headers, undefined, true), undefined)
  headers.delete('x-vercel-forwarded-for')
  assert.equal(getTrustedClientIP(headers, undefined, true), '198.51.100.20')
})

test('Resend SMTP uses TLS and credentials; local Mailpit remains supported', () => {
  const env = {
    ...remote, BETTER_AUTH_URL: 'https://demo.example.com', BETTER_AUTH_SECRET: 'unit-test-secret-with-at-least-32-characters',
    SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'resend', SMTP_PASSWORD: 'fake-resend-key', SMTP_FROM: 'garden@example.com'
  }
  const smtp = getMailTransportOptions(getAuthConfig(env))
  assert.equal(smtp.secure, true)
  assert.deepEqual(smtp.auth, { user: 'resend', pass: 'fake-resend-key' })
  assert.equal(smtp.tls?.rejectUnauthorized, true)
  assert.throws(() => getAuthConfig({ ...env, SMTP_SECURE: 'false' }), /SMTP_SECURE/)
  assert.throws(() => getAuthConfig({ ...env, SMTP_PORT: '25' }), /port 25/)
  assert.throws(() => getAuthConfig({ ...env, BETTER_AUTH_URL: 'http://demo.example.com' }), /HTTPS/)
  const starttls = getMailTransportOptions(getAuthConfig({ ...env, SMTP_PORT: '587', SMTP_SECURE: 'false' }))
  assert.equal(starttls.requireTLS, true)
  const mailpit = getMailTransportOptions(getAuthConfig({ ...env, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASSWORD: '' }))
  assert.equal(mailpit.requireTLS, false)
  assert.equal(mailpit.auth, undefined)
})
