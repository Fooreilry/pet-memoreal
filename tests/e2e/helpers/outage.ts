import { createHmac } from 'node:crypto'

export const outageOrigin = 'http://127.0.0.1:4176'
// A public, test-only signing key; never used by the application outside this fixture.
export const outageSecret = 'offline-service-outage-fixture-only-2026'
export const outageToken = 'offline-session-lookup-fixture'
export const outageCookie = encodeURIComponent(`${outageToken}.${createHmac('sha256', outageSecret).update(outageToken).digest('base64')}`)
