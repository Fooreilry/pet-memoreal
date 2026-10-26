import { setTimeout as delay } from 'node:timers/promises'
import { test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

type Credentials = { origin: string, email: string, password: string }
type SignInResponse = { status: () => number, headers: () => Record<string, string> }

// Browser journeys and fixtures share one local IP; keep the real limit enabled.
export async function waitForSignInRetry(response: SignInResponse) {
  if (response.status() !== 429) return false
  const retryAfter = Number(response.headers()['x-retry-after'])
  const seconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(61, Math.max(1, Math.ceil(retryAfter) + 1)) : 61
  const wait = seconds * 1000
  const info = test.info()
  if (info.timeout > 0) info.setTimeout(info.timeout + wait + 5000)
  await delay(wait)
  return true
}

export async function signInFixture(request: APIRequestContext, { origin, email, password }: Credentials) {
  const signIn = () => request.post(new URL('/api/auth/sign-in/email', origin).href, { headers: { origin }, data: { email, password } })
  const response = await signIn()
  return await waitForSignInRetry(response) ? signIn() : response
}
