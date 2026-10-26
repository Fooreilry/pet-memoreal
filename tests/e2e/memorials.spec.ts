import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { signInFixture } from './helpers/sign-in'

const password = 'Memorial-fixture-2026!'
const origin = 'http://127.0.0.1:4173'
type Member = { id: string, email: string }

const test = base.extend<{ members: { owner: Member, other: Member, unverified: Member } }>({
  members: async ({ baseURL }, use) => {
    if (baseURL !== origin) throw new Error('Memorial fixtures require the local E2E server')
    const database = process.env.E2E_DATABASE
    if (!database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Test fixtures require a temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const ids: string[] = []
    try {
      const hashed = await hashPassword(password)
      async function member(verified: boolean) {
        const id = randomUUID()
        const email = `memorial-${id}@example.test`
        await pool.query('INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, $4)', [id, 'Memorial test', email, verified])
        ids.push(id)
        await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, hashed])
        return { id, email }
      }
      await use({ owner: await member(true), other: await member(true), unverified: await member(false) })
    } finally {
      // Delete only this fixture's users; the foreign key removes their memorials.
      await pool.query('DELETE FROM auth_user WHERE id = ANY($1::text[])', [ids])
      await pool.end()
    }
  }
})

async function signIn(request: APIRequestContext, member: Member) {
  const response = await signInFixture(request, { origin, email: member.email, password })
  expect(response.ok()).toBe(true)
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: create in a chosen garden place, reload it, find it in the account and visit as a guest`, async ({ page, members, browser, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    const place = ru ? 3 : 4
    await page.goto(`/${locale}/gardens?garden=lake`)
    const empty = page.getByTestId(`empty-lake-${place}`)
    await expect(empty).toBeEnabled()
    if (isMobile) await empty.tap()
    else await empty.click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?redirect=`))
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(`/${locale}/gardens?garden=lake&create=${place}`)
    const registration = page.locator('.auth-links').getByRole('link', { name: ru ? 'Создать аккаунт' : 'Create an account', exact: true })
    expect(new URL((await registration.getAttribute('href'))!, origin).searchParams.get('redirect')).toBe(`/${locale}/gardens?garden=lake&create=${place}`)
    await page.getByLabel('Email', { exact: true }).fill(members.owner.email)
    await page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: ru ? 'Войти' : 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=lake&create=${place}$`))
    await expect(page.getByRole('dialog')).toHaveAccessibleName(ru ? 'Создать место памяти' : 'Create a memorial')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-motion', 'paused')
    await expect(page.getByTestId('creation-location')).toContainText(`${ru ? 'Место' : 'Place'} ${place}`)
    const anonymous = page.getByRole('checkbox', { name: ru ? 'Остаться анонимным' : 'Remain anonymous', exact: true })
    await expect(anonymous).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(empty).toBeFocused()
    if (!isMobile) await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-motion', 'running')
    await page.getByTestId('garden-zoom-in').click()
    if (isMobile) await empty.tap()
    else await empty.click()
    const submit = page.getByRole('button', { name: ru ? 'Сохранить место памяти' : 'Save memorial', exact: true })
    await submit.click()
    const name = page.getByLabel(ru ? 'Имя питомца' : 'Pet’s name', { exact: true })
    const born = page.getByLabel(ru ? 'Год рождения' : 'Year of birth', { exact: true })
    const died = page.getByLabel(ru ? 'Год ухода' : 'Year of passing', { exact: true })
    const story = page.getByLabel(ru ? 'История питомца' : 'Your pet’s story', { exact: true })
    await expect(name).toBeFocused()
    await name.fill('  Мой друг <Milo>  ')
    await born.fill('2020')
    await died.fill('2019')
    await story.fill('Тёплая память.\n<script>window.memorialXss=true</script>')
    await submit.click()
    await expect(page.getByText(ru ? 'Год ухода не может быть раньше года рождения.' : 'The year of passing cannot be earlier than the year of birth.', { exact: true })).toBeVisible()
    await died.fill('2025')
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByTestId('creation-location')).toContainText(ru ? 'Озеро' : 'Lake')
    // A failed save keeps the text and permits retry with the same request ID.
    await page.route('**/api/memorials', route => route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Unavailable' } }))
    await submit.click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(story).toHaveValue('Тёплая память.\n<script>window.memorialXss=true</script>')
    await page.unroute('**/api/memorials')
    await page.screenshot({ path: testInfo.outputPath('memorial-form.png'), fullPage: true, animations: 'disabled' })
    await submit.click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=lake&memorial=`))
    const id = new URL(page.url()).searchParams.get('memorial')!
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAccessibleName('Мой друг <Milo>')
    await expect(dialog.locator('.memorial-location')).toContainText(`${ru ? 'Место' : 'Place'} ${place}`)
    await expect(empty).toHaveCount(0)
    await expect(dialog).toContainText('2020 — 2025')
    await expect(page.getByTestId('memorial-creator')).toHaveText(`${ru ? 'Создатель места:' : 'Created by:'} Memorial test`)
    await expect(dialog).toContainText('<script>window.memorialXss=true</script>')
    expect(await page.evaluate(() => Object.hasOwn(window, 'memorialXss'))).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('saved-memorial.png'), animations: 'disabled' })
    await page.reload()
    await expect(dialog).toHaveAccessibleName('Мой друг <Milo>')
    await expect(page.getByTestId('memorial-creator')).toContainText('Memorial test')
    await expect(page.getByTestId('garden-account-menu')).toHaveAttribute('data-authenticated', 'true')
    await page.keyboard.press('Escape')
    await page.getByTestId('garden-account-menu').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: ru ? 'Профиль' : 'Profile', exact: true }).click()
    await expect(page.getByRole('list', { name: ru ? 'Мои места памяти' : 'My memorials' })).toContainText('Мой друг <Milo>')
    await page.getByRole('link', { name: /Мой друг/ }).click()
    await expect(dialog).toHaveAccessibleName('Мой друг <Milo>')
    const guest = await browser.newContext({ baseURL: origin })
    try {
      const other = await guest.newPage()
      await other.goto(`/${locale}/gardens?garden=lake&memorial=${id}`)
      await expect(other.getByRole('dialog')).toHaveAccessibleName('Мой друг <Milo>')
      await expect(other.getByTestId('memorial-creator')).toContainText('Memorial test')
      const response = await other.request.get('/api/gardens/lake/memorials')
      expect(response.headers()['cache-control']).toContain('no-store')
      const records = await response.json()
      const saved = records.find((item: { id: string }) => item.id === id)
      expect(saved).toMatchObject({ name: 'Мой друг <Milo>', gardenId: 'lake', place, born: 2020, died: 2025, creatorName: 'Memorial test' })
      expect(Object.keys(saved).sort()).toEqual(['source', 'id', 'gardenId', 'place', 'name', 'born', 'died', 'story', 'species', 'creatorName'].sort())
      expect((await other.request.get('/api/memorials/mine')).status()).toBe(401)
    } finally { await guest.close() }
  })
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: anonymous creation hides the creator from guests and keeps the memorial in the owner account`, async ({ page, members, browser, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    const place = ru ? 3 : 4
    await signIn(page.request, members.owner)
    const profileName = `Private ${randomUUID()}`
    const profile = await page.request.post('/api/auth/update-user', { headers: { origin }, data: { name: profileName, surname: 'Private surname' } })
    expect(profile.ok()).toBe(true)
    await page.goto(`/${locale}/gardens?garden=meadow&create=${place}`)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAccessibleName(ru ? 'Создать место памяти' : 'Create a memorial')
    await dialog.getByLabel(ru ? 'Имя питомца' : 'Pet’s name', { exact: true }).fill('Тихая память')
    await dialog.getByLabel(ru ? 'Год рождения' : 'Year of birth', { exact: true }).fill('2011')
    await dialog.getByLabel(ru ? 'Год ухода' : 'Year of passing', { exact: true }).fill('2025')
    await dialog.getByLabel(ru ? 'История питомца' : 'Your pet’s story', { exact: true }).fill('Память о нашем любимом друге.')
    const anonymous = dialog.getByRole('checkbox', { name: ru ? 'Остаться анонимным' : 'Remain anonymous', exact: true })
    await expect(anonymous).not.toBeChecked()
    if (isMobile) await anonymous.tap()
    else { await anonymous.focus(); await page.keyboard.press('Space') }
    await expect(anonymous).toBeChecked()
    const submit = dialog.getByRole('button', { name: ru ? 'Сохранить место памяти' : 'Save memorial', exact: true })
    await page.route('**/api/memorials', route => route.fulfill({ status: 503, json: { statusCode: 503 } }))
    await submit.click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(anonymous).toBeChecked()
    await page.unroute('**/api/memorials')
    await page.screenshot({ path: testInfo.outputPath('anonymous-form.png'), animations: 'disabled' })
    const [saveRequest] = await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname === '/api/memorials' && request.method() === 'POST'),
      submit.click()
    ])
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=meadow&memorial=`))
    const url = page.url()
    const id = new URL(url).searchParams.get('memorial')!
    await expect(dialog).toHaveAccessibleName('Тихая память')
    await expect(page.getByTestId('memorial-creator')).toHaveText(`${ru ? 'Создатель места:' : 'Created by:'} ${ru ? 'Анонимно' : 'Anonymous'}`)
    const payload = saveRequest.postDataJSON()
    expect(payload.isAnonymous).toBe(true)
    const replay = await page.request.post('/api/memorials', { headers: { origin }, data: payload })
    expect(replay.status()).toBe(201)
    expect(await replay.json()).toMatchObject({ id, creatorName: null })
    expect((await page.request.post('/api/memorials', { headers: { origin }, data: { ...payload, isAnonymous: false } })).status()).toBe(409)
    const mine = await (await page.request.get('/api/memorials/mine')).json()
    expect(mine.find((item: { id: string }) => item.id === id)).toMatchObject({ creatorName: null })
    const guest = await browser.newContext({ baseURL: origin })
    try {
      const other = await guest.newPage()
      await other.goto(url)
      await expect(other.getByRole('dialog')).toHaveAccessibleName('Тихая память')
      await expect(other.getByTestId('memorial-creator')).toHaveText(`${ru ? 'Создатель места:' : 'Created by:'} ${ru ? 'Анонимно' : 'Anonymous'}`)
      await other.reload()
      await expect(other.getByTestId('memorial-creator')).toContainText(ru ? 'Анонимно' : 'Anonymous')
      const records = await (await other.request.get('/api/gardens/meadow/memorials')).json()
      const record = records.find((item: { id: string }) => item.id === id)
      expect(record.creatorName).toBeNull()
      expect(Object.keys(record).sort()).toEqual(['source', 'id', 'gardenId', 'place', 'name', 'born', 'died', 'story', 'species', 'creatorName'].sort())
      const json = JSON.stringify(record)
      for (const secret of [members.owner.id, members.owner.email, profileName, 'Private surname']) expect(json).not.toContain(secret)
      await expect(other.getByRole('dialog')).not.toContainText(profileName)
      await other.screenshot({ path: testInfo.outputPath('anonymous-story.png'), animations: 'disabled' })
    } finally { await guest.close() }
  })
}

base('the anonymity migration preserves old records without changing the default for new memorials', async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Migration behavior does not depend on viewport')
  const database = process.env.E2E_DATABASE
  if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Migration checks require the temporary E2E database')
  const pool = new pg.Pool({ ...getDatabaseOptions(), database })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // PostgreSQL resolves this temporary table before the real memorials table.
    await client.query('CREATE TEMP TABLE memorials (id integer) ON COMMIT DROP')
    await client.query('INSERT INTO memorials (id) VALUES (1)')
    await client.query(await readFile(new URL('../../drizzle/0005_chubby_starfox.sql', import.meta.url), 'utf8'))
    await client.query('INSERT INTO memorials (id) VALUES (2)')
    const { rows } = await client.query('SELECT id, is_anonymous FROM memorials ORDER BY id')
    expect(rows).toEqual([{ id: 1, is_anonymous: true }, { id: 2, is_anonymous: false }])
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
})

test('a place taken during editing keeps the draft and displays the saved memorial after closing', async ({ page, members, browser }) => {
  await signIn(page.request, members.owner)
  await page.goto('/en/gardens?garden=grove&create=3')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('Create a memorial')
  await dialog.getByLabel('Pet’s name', { exact: true }).fill('My friend')
  await dialog.getByLabel('Year of birth', { exact: true }).fill('2010')
  await dialog.getByLabel('Year of passing', { exact: true }).fill('2025')
  await dialog.getByLabel('Your pet’s story', { exact: true }).fill('A memory that must not disappear.')
  const other = await browser.newContext({ baseURL: origin })
  try {
    await signIn(other.request, members.other)
    const saved = await other.request.post('/api/memorials', { headers: { origin }, data: { requestId: randomUUID(), gardenId: 'grove', place: 3, name: 'Another friend', born: 2010, died: 2025, story: 'A quiet memory.' } })
    expect(saved.status()).toBe(201)
    const record = await saved.json()
    await dialog.getByRole('button', { name: 'Save memorial', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('This place has just been taken.')
    await expect(dialog.getByLabel('Your pet’s story', { exact: true })).toHaveValue('A memory that must not disappear.')
    expect(await (await page.request.get('/api/memorials/mine')).json()).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('empty-grove-3')).toHaveCount(0)
    await page.getByTestId(`memorial-${record.id}`).click()
    await expect(dialog).toHaveAccessibleName('Another friend')
  } finally { await other.close() }
})

test('creation API enforces authentication, validation, origin, allocation, idempotency and full capacity', async ({ request, members, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server rules do not depend on viewport')
  const data = { requestId: randomUUID(), name: '  Friend  ', born: 2012, died: 2025, story: '  A quiet memory.  ', gardenId: 'hill' }
  const post = (payload: unknown, headers = { origin }) => request.post('/api/memorials', { data: payload, headers })
  expect((await post(data)).status()).toBe(401)
  expect((await request.get('/api/gardens/unknown/memorials')).status()).toBe(404)
  const unverified = await request.post('/api/auth/sign-in/email', { data: { email: members.unverified.email, password }, headers: { origin } })
  expect(unverified.ok()).toBe(false)
  expect((await post(data)).status()).toBe(401)
  await signIn(request, members.owner)
  expect((await post(data, { origin: 'https://untrusted.example' })).status()).toBe(403)
  expect((await request.post('/api/memorials', { data: JSON.stringify(data), headers: { origin, 'content-type': 'text/plain' } })).status()).toBe(415)
  for (const invalid of [
    { ...data, name: ' ' }, { ...data, born: new Date().getUTCFullYear() + 1 }, { ...data, died: 2011 },
    { ...data, gardenId: 'unknown' }, { ...data, story: '' }, { ...data, story: 'a'.repeat(5001) },
    { ...data, ownerId: members.other.id }, { ...data, place: 1 }, { ...data, place: 0 }, { ...data, place: 15 },
    { ...data, place: 3.5 }, { ...data, place: '3' }, { ...data, visibility: 'private' },
    { ...data, isAnonymous: 'true' }, { ...data, isAnonymous: null }, { ...data, isAnonymous: 1 }, { ...data, creatorName: 'Forged name' }
  ]) expect((await post(invalid)).status()).toBe(400)
  const chosen = { ...data, place: 3 }
  const concurrent = await Promise.all([post(chosen), post(chosen), post({ ...data, place: 4, requestId: randomUUID(), name: 'Second' })])
  for (const response of concurrent) expect(response.status()).toBe(201)
  const [first, repeated, second] = await Promise.all(concurrent.map(response => response.json()))
  expect(first.id).toBe(repeated.id)
  expect(first.place).not.toBe(second.place)
  expect(first).toMatchObject({ name: 'Friend', story: 'A quiet memory.', creatorName: 'Memorial test' })
  expect(first.place).toBe(3)
  expect(second.place).toBe(4)
  expect((await post({ ...data, name: 'Changed request' })).status()).toBe(409)
  expect((await post({ ...chosen, place: 5 })).status()).toBe(409)
  expect((await post({ ...chosen, isAnonymous: true })).status()).toBe(409)
  expect((await post({ ...chosen, requestId: randomUUID() })).status()).toBe(409)
  const competing = await Promise.all([post({ ...data, place: 5, requestId: randomUUID() }), post({ ...data, place: 5, requestId: randomUUID() })])
  expect(competing.map(response => response.status()).sort()).toEqual([201, 409])
  for (let i = 0; i < 7; i++) expect((await post({ ...data, requestId: randomUUID(), name: `Friend ${i}` })).status()).toBe(201)
  expect((await post({ ...data, requestId: randomUUID() })).status()).toBe(409)
  // Replaying the original save still works when the garden is full.
  expect((await (await post(data)).json()).id).toBe(first.id)
  const rows = await (await request.get('/api/memorials/mine')).json()
  expect(rows).toHaveLength(10)
  expect(new Set(rows.map((item: { place: number }) => item.place)).size).toBe(10)
  expect(rows.some((item: { place: number }) => [1, 2, 7, 14].includes(item.place))).toBe(false)
  const other = await browser.newContext({ baseURL: origin })
  try {
    await signIn(other.request, members.other)
    expect(await (await other.request.get('/api/memorials/mine')).json()).toEqual([])
  } finally { await other.close() }
})
