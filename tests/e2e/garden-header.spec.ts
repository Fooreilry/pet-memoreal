import { visitLocale } from './helpers/locale'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { signInFixture } from './helpers/sign-in'

const origin = 'http://127.0.0.1:4173'
const test = base.extend<{ member: { id: string } }>({
  member: [async ({ page, baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Garden header fixtures require the temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const id = randomUUID()
    const email = `garden-header-${id}@example.test`
    const password = 'Garden-header-fixture-2026!'
    try {
      await pool.query('INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [id, 'Garden visitor', email])
      await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, await hashPassword(password)])
      const response = await signInFixture(page.request, { origin, email, password })
      expect(response.ok()).toBe(true)
      await use({ id })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = $1', [id])
      await pool.end()
    }
  }, { timeout: 90_000 }]
})

async function openAccount(page: Page, isMobile: boolean) {
  const trigger = page.getByTestId('garden-account-menu')
  if (isMobile) await trigger.tap()
  else await trigger.hover()
  await expect(page.getByRole('menu')).toBeVisible()
}

for (const locale of ['ru', 'en']) {
  base(`${locale}: guests see a header above four gardens, with a keyboard and touch accessible account menu`, async ({ page, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    const response = await visitLocale(page, `/gardens`, locale)
    expect(response!.headers()['cache-control']).toContain('private')
    expect(response!.headers()['cache-control']).toContain('no-store')
    const header = page.getByTestId('garden-header')
    const icon = page.getByTestId('garden-account-menu')
    await expect(header).toBeVisible()
    await expect(icon).toHaveAttribute('data-authenticated', 'false')
    await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
    await expect(page.getByTestId('garden-switch')).toHaveCount(0)
    await expect(page.locator('.garden-title')).toHaveCount(0)
    await icon.focus()
    await page.keyboard.press('Enter')
    const login = page.getByRole('menuitem', { name: ru ? 'Войти' : 'Sign in', exact: true })
    const register = page.getByRole('menuitem', { name: ru ? 'Создать аккаунт' : 'Create an account', exact: true })
    await expect(login).toBeVisible()
    await expect(register).toBeVisible()
    await expect(page.getByRole('menuitem', { name: ru ? 'Выйти' : 'Sign out', exact: true })).toHaveCount(0)
    await expect(login).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(register).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(login).toBeFocused()
    await page.keyboard.press('End')
    await expect(register).toBeFocused()
    await page.keyboard.press('Home')
    await expect(login).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(register).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(icon).toBeFocused()
    if (!isMobile) {
      const tile = page.getByTestId('garden-choice-meadow')
      await tile.focus()
      await openAccount(page, false)
      await expect(tile).toBeFocused()
      await login.hover()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.mouse.move(0, page.viewportSize()!.height - 1)
      await expect(page.getByRole('menu')).toHaveCount(0)
    }
    await openAccount(page, isMobile)
    await page.screenshot({ path: testInfo.outputPath('garden-header-guest.png'), animations: 'disabled' })
    await login.click()
    await expect(page).toHaveURL(new RegExp(`/login$`))
    await page.goBack()
    await page.getByRole('link', { name: ru ? 'Switch to English' : 'Переключить на русский', exact: true }).click()
    await expect(page).toHaveURL(/\/gardens$/)
    await expect(page.locator('html')).toHaveAttribute('lang', ru ? 'en' : 'ru')
    await expect(page.getByTestId('garden-header')).toBeVisible()
    await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  })

  test(`${locale}: account menu opens the profile and signs out to the landing without deleting saved memorials`, async ({ page, member, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    expect(member.id).toBeTruthy()
    // Keep header fixtures separate from creation scenarios, which use lake places 3 and 4.
    const response = await page.request.post('/api/memorials', { headers: { origin }, data: { name: 'Луна', born: 2012, died: 2025, story: 'Встречала нас у двери и любила солнечные дни.', gardenId: 'lake', place: ru ? 8 : 9, requestId: randomUUID() } })
    expect(response.status()).toBe(201)
    const memorial = await response.json()
    await visitLocale(page, `/gardens`, locale)
    const icon = page.getByTestId('garden-account-menu')
    await expect(icon).toHaveAttribute('data-authenticated', 'true')
    await openAccount(page, isMobile)
    const profile = page.getByRole('menuitem', { name: ru ? 'Профиль' : 'Profile', exact: true })
    const exit = page.getByRole('menuitem', { name: ru ? 'Выйти' : 'Sign out', exact: true })
    await expect(profile).toBeVisible()
    await expect(exit).toBeVisible()
    await profile.click()
    await expect(page).toHaveURL(new RegExp(`/account$`))
    await expect(page.getByTestId('profile-name')).toHaveText('Garden visitor')
    await page.goBack()
    await page.getByTestId('garden-choice-lake').click()
    await expect(page.getByTestId('garden-header')).toBeVisible()
    await expect(page.locator('.garden-title')).toHaveText(ru ? 'Озеро' : 'Lake')
    const stone = page.getByTestId(`memorial-${memorial.id}`)
    await expect(stone).toBeVisible()
    await page.route('**/api/auth/sign-out', route => route.abort('failed'))
    await openAccount(page, isMobile)
    await page.screenshot({ path: testInfo.outputPath('garden-header-member.png'), animations: 'disabled' })
    await exit.click()
    await expect(page.getByText(ru ? 'Не удалось выполнить запрос. Попробуйте ещё раз немного позже.' : 'We could not complete your request. Please try again shortly.', { exact: true })).toBeVisible()
    await expect(icon).toBeEnabled()
    await expect(icon).toHaveAttribute('data-authenticated', 'true')
    expect((await page.request.get('/api/me')).status()).toBe(200)
    await page.unroute('**/api/auth/sign-out')
    await openAccount(page, isMobile)
    await exit.click()
    await expect(page).toHaveURL(new RegExp(`/$`))
    await expect(page.locator('.landing')).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(401)
    await page.reload()
    await expect(page.locator('.landing')).toBeVisible()
    await visitLocale(page, `/gardens?garden=lake`, locale)
    await expect(icon).toHaveAttribute('data-authenticated', 'false')
    await expect(stone).toBeVisible()
    await stone.focus()
    await expect(stone).toBeInViewport()
    await stone.click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Луна')
    await page.keyboard.press('Escape')
    await openAccount(page, isMobile)
    await expect(page.getByRole('menuitem', { name: ru ? 'Войти' : 'Sign in', exact: true })).toBeVisible()
    await expect(profile).toHaveCount(0)
  })
}
