import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { visitLocale } from './helpers/locale'
import { waitForSignInRetry } from './helpers/sign-in'

const origin = 'http://127.0.0.1:4173'
type Member = { email: string, password: string }

const test = base.extend<{ member: Member }>({
  member: [async ({ baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Garden session fixtures require the temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const id = randomUUID()
    const email = `garden-session-${id}@example.test`
    const password = 'Garden-session-fixture-2026!'
    try {
      await pool.query('INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [id, 'Returning visitor', email])
      await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, await hashPassword(password)])
      await use({ email, password })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = $1', [id])
      await pool.end()
    }
  }, { timeout: 90_000 }]
})

async function snapshot(page: Page) {
  const view = page.locator('.canvas-wrapper')
  await expect(view).toHaveAttribute('data-state', 'ready')
  const seed = await view.getAttribute('data-session-seed')
  expect(seed).toMatch(/^\d+$/)
  const places = await page.locator('.memorial-position').evaluateAll(elements => elements.map(element => {
    const node = element as HTMLElement
    return { chunk: node.dataset.chunkId, x: Number(node.dataset.worldX), y: Number(node.dataset.worldY) }
  }))
  expect(places).toHaveLength(12)
  return { seed, places }
}

async function signIn(page: Page, member: Member) {
  const target = new URLSearchParams({ redirect: '/gardens?garden=meadow' })
  await visitLocale(page, `/login?${target}`, 'en')
  await page.getByLabel('Email', { exact: true }).fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill(member.password)
  const submit = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/sign-in/email' && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Sign in', exact: true }).click()
    ])
    return response
  }
  let response = await submit()
  if (await waitForSignInRetry(response)) response = await submit()
  expect(response.ok()).toBe(true)
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
  await expect(page.getByTestId('garden-account-menu')).toHaveAttribute('data-authenticated', 'true')
  return snapshot(page)
}

async function openAccount(page: Page, isMobile: boolean) {
  const trigger = page.getByTestId('garden-account-menu')
  if (isMobile) await trigger.tap()
  else await trigger.hover()
  await expect(page.getByRole('menu')).toBeVisible()
}

test('successful sign-out and sign-in renew scenery across open tabs while a saved memorial keeps its permanent chunk', async ({ page, context, member, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  const guest = await snapshot(page)
  const first = await signIn(page, member)
  expect(first.seed).not.toBe(guest.seed)
  expect(first.places.map(place => place.chunk)).toEqual(guest.places.map(place => place.chunk))

  // Other creation fixtures use meadow places 3 and 4; reserve two separate places.
  const place = isMobile ? 11 : 10
  const created = await page.request.post('/api/memorials', { headers: { origin }, data: { name: 'A familiar friend', born: 2010, died: 2024,
    story: 'The garden changes softly, but this memory remains in its own corner.', gardenId: 'meadow', place, requestId: randomUUID() } })
  expect(created.status()).toBe(201)
  const memorial = await created.json()
  await page.reload()
  const saved = page.getByTestId(`memorial-${memorial.id}`)
  await expect(saved).toBeAttached()
  expect(await snapshot(page)).toEqual(first)
  const originalChunk = first.places[place - 1]!.chunk
  expect(await saved.evaluate(element => element.closest<HTMLElement>('.memorial-position')?.dataset.chunkId)).toBe(originalChunk)

  const otherTab = await context.newPage()
  try {
    await otherTab.emulateMedia({ reducedMotion: 'reduce' })
    await visitLocale(otherTab, '/gardens?garden=meadow', 'en')
    expect(await snapshot(otherTab)).toEqual(first)
    const otherSaved = otherTab.getByTestId(`memorial-${memorial.id}`)
    await expect(otherSaved).toBeAttached()

    await page.route('**/api/auth/sign-out', route => route.abort('failed'))
    await openAccount(page, isMobile)
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(page.getByText('We could not complete your request. Please try again shortly.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('garden-account-menu')).toHaveAttribute('data-authenticated', 'true')
    expect(await snapshot(page)).toEqual(first)
    expect(await snapshot(otherTab)).toEqual(first)
    await page.unroute('**/api/auth/sign-out')
    await openAccount(page, isMobile)
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/$`))
    await expect(page.locator('.landing')).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(401)
    await visitLocale(page, '/gardens?garden=meadow', 'en')
    const signedOut = await snapshot(page)
    expect(signedOut.seed).not.toBe(first.seed)
    await expect(saved).toBeAttached()
    // The open garden must follow the renewed session without needing a reload.
    await expect.poll(() => snapshot(otherTab)).toEqual(signedOut)
    await expect(otherTab).toHaveURL(/\/gardens\?garden=meadow$/)
    expect(await otherSaved.evaluate(element => element.closest<HTMLElement>('.memorial-position')?.dataset.chunkId)).toBe(originalChunk)

    const second = await signIn(page, member)
    expect(second.seed).not.toBe(first.seed)
    expect(second.seed).not.toBe(signedOut.seed)
    expect(second.places.map(item => item.chunk)).toEqual(first.places.map(item => item.chunk))
    expect(second.places.some((item, index) => item.x !== first.places[index]!.x || item.y !== first.places[index]!.y)).toBe(true)
    await expect.poll(() => snapshot(otherTab)).toEqual(second)
    expect(await otherSaved.evaluate(element => element.closest<HTMLElement>('.memorial-position')?.dataset.chunkId)).toBe(originalChunk)
    await otherTab.reload()
    expect(await snapshot(otherTab)).toEqual(second)
    expect(await saved.evaluate(element => element.closest<HTMLElement>('.memorial-position')?.dataset.chunkId)).toBe(originalChunk)
    await saved.click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('A familiar friend')
    await page.keyboard.press('Escape')
    await page.reload()
    expect(await snapshot(page)).toEqual(second)
  } finally {
    await otherTab.close()
  }
})
