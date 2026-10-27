import { visitLocale } from './helpers/locale'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { signInFixture } from './helpers/sign-in'

const origin = 'http://127.0.0.1:4173'
const test = base.extend<{ member: { id: string, email: string } }>({
  member: [async ({ page, baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Account fixtures require the temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const id = randomUUID()
    const email = `account-${id}@example.test`
    const password = 'Account-fixture-2026!'
    try {
      await pool.query('INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [id, 'Александра', email])
      await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, await hashPassword(password)])
      const response = await signInFixture(page.request, { origin, email, password })
      expect(response.ok()).toBe(true)
      await use({ id, email })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = $1', [id])
      await pool.end()
    }
  }, { timeout: 90_000 }]
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: standalone account, editable profile, persisted surname and bottom sign out`, async ({ page, member }, testInfo) => {
    const ru = locale === 'ru'
    await visitLocale(page, `/account`, locale)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ru ? 'Мой кабинет' : 'My account')
    await expect(page.locator('.auth-card, .auth-aside, .auth-background')).toHaveCount(0)
    await expect(page.getByTestId('profile-name')).toHaveText('Александра')
    await expect(page.getByTestId('profile-surname')).toHaveText(ru ? 'Не указана' : 'Not provided')
    await expect(page.locator('.account-profile')).toContainText(member.email)
    await expect(page.getByRole('heading', { name: ru ? 'Здесь будут ваши места памяти' : 'Your memorials will be here' })).toBeVisible()
    await expect(page.getByRole('link', { name: ru ? 'Создать место памяти' : 'Create a memorial', exact: true })).toHaveAttribute('href', `/gardens`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('account-empty.png'), fullPage: true })

    const edit = page.getByRole('button', { name: ru ? 'Изменить' : 'Edit', exact: true })
    await edit.click()
    const dialog = page.getByRole('dialog')
    const name = dialog.getByLabel(ru ? 'Имя' : 'First name', { exact: true })
    const surname = dialog.getByLabel(ru ? 'Фамилия' : 'Last name', { exact: true })
    const save = dialog.getByRole('button', { name: ru ? 'Сохранить' : 'Save', exact: true })
    await name.fill(' ')
    await save.click()
    await expect(name).toBeFocused()
    await expect(dialog.getByText(ru ? 'Укажите ваше имя.' : 'Please enter your name.', { exact: true })).toBeVisible()
    await name.fill('  Александра  ')
    await surname.fill('  Иванова  ')
    await page.screenshot({ path: testInfo.outputPath('account-profile-edit.png'), animations: 'disabled' })
    await page.route('**/api/auth/update-user', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }))
    await save.click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(surname).toHaveValue('  Иванова  ')
    await page.unroute('**/api/auth/update-user')
    await save.click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('profile-surname')).toHaveText('Иванова')
    await page.reload()
    await expect(page.getByTestId('profile-name')).toHaveText('Александра')
    await expect(page.getByTestId('profile-surname')).toHaveText('Иванова')
    const me = await page.request.get('/api/me')
    expect(me.headers()['cache-control']).toContain('no-store')
    expect(await me.json()).toMatchObject({ name: 'Александра', surname: 'Иванова', email: member.email })
    // Optional surname can be cleared, and cancel must not persist a draft.
    await edit.click()
    await surname.fill('Не сохранять')
    await dialog.getByRole('button', { name: ru ? 'Отмена' : 'Cancel', exact: true }).click()
    await expect(edit).toBeFocused()
    await edit.click()
    await expect(surname).toHaveValue('Иванова')
    await surname.fill('')
    await save.click()
    await expect(dialog).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('profile-surname')).toHaveText(ru ? 'Не указана' : 'Not provided')

    const exit = page.getByRole('button', { name: ru ? 'Выйти' : 'Sign out', exact: true })
    const bounds = await page.locator('.account-memorials').boundingBox()
    const logoutBounds = await exit.boundingBox()
    expect(logoutBounds!.y).toBeGreaterThan(bounds!.y + bounds!.height)
    await page.route('**/api/auth/sign-out', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }))
    await exit.click()
    await expect(page.locator('.account-session').getByRole('alert')).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(200)
    await page.unroute('**/api/auth/sign-out')
    await exit.click()
    await expect(page).toHaveURL(new RegExp(`/$`))
    await expect(page.locator('.landing')).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test(`${locale}: saved memorial cards, list retry and garden navigation`, async ({ page, member }, testInfo) => {
    const ru = locale === 'ru'
    const created = await page.request.post('/api/memorials', { headers: { origin }, data: { name: 'Мило', born: 2014, died: 2025, story: 'Любил солнце и всегда встречал нас у двери.', gardenId: 'grove', requestId: randomUUID() } })
    expect(created.status()).toBe(201)
    const memorial = await created.json()
    expect(member.id).toBeTruthy()
    await visitLocale(page, `/gardens`, locale)
    await page.route('**/api/memorials/mine', route => route.fulfill({ status: 503, json: { statusMessage: 'Unavailable' } }))
    // Client navigation allows the failed API response to be controlled without mocking SSR.
    if (testInfo.project.name === 'mobile') await page.getByTestId('garden-account-menu').tap()
    else await page.getByTestId('garden-account-menu').click()
    await page.getByRole('menuitem', { name: ru ? 'Профиль' : 'Profile', exact: true }).click()
    const section = page.locator('.account-memorials')
    await expect(section.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('profile-name')).toHaveText('Александра')
    await page.unroute('**/api/memorials/mine')
    await section.getByRole('button', { name: ru ? 'Попробовать ещё раз' : 'Try again' }).click()
    const list = page.getByRole('list', { name: ru ? 'Мои места памяти' : 'My memorials' })
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('Мило')
    await expect(list).toContainText('2014 — 2025')
    await expect(list).toContainText(ru ? 'Роща' : 'Grove')
    await expect(list).toContainText('Любил солнце')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('account-memorials.png'), fullPage: true })
    await list.getByRole('link', { name: /Мило/ }).click()
    await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=grove&memorial=${memorial.id}`))
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Мило')
  })
}

test('profile updates validate both fields and reject untrusted origins', async ({ page, member }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server rules are independent of viewport')
  const update = (data: unknown, requestOrigin = origin) => page.request.post('/api/auth/update-user', { headers: { origin: requestOrigin }, data })
  expect((await update({ name: ' ' })).status()).toBe(400)
  expect((await update({ name: 'Александра', surname: 'x'.repeat(81) })).status()).toBe(400)
  expect((await update({ surname: 42 })).status()).toBe(400)
  expect((await update({ surname: 'Подмена' }, 'https://untrusted.example')).status()).toBe(403)
  expect((await update({ email: 'replaced@example.test' })).status()).toBe(400)
  expect((await update({ surname: 'Подмена', role: 'admin' })).status()).toBe(400)
  const response = await update({ surname: '  Иванова  ' })
  expect(response.ok()).toBe(true)
  const me = await page.request.get('/api/me')
  expect(await me.json()).toMatchObject({ name: 'Александра', surname: 'Иванова', email: member.email })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.role).toBe('user')
})
