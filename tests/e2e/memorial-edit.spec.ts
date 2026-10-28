import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { visitLocale } from './helpers/locale'
import { signInFixture } from './helpers/sign-in'
import { choosePetSpecies } from './helpers/pet-species'

const origin = 'http://127.0.0.1:4173'
const password = 'Memorial-edit-fixture-2026!'
type Member = { id: string, email: string, name: string }
type Stored = { ownerId: string, gardenId: string, place: number, requestId: string, name: string, species: string, born: number, died: number, story: string, isAnonymous: boolean }
type Members = { owner: Member, other: Member, stored: (id: string) => Promise<Stored> }

const test = base.extend<{ members: Members }>({
  members: async ({ baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Memorial editing fixtures require the temporary local E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const ids: string[] = []
    try {
      const hashed = await hashPassword(password)
      async function member() {
        const id = randomUUID(), email = `memorial-edit-${id}@example.test`, name = `Keeper ${id.slice(0, 8)}`
        await pool.query('INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [id, name, email])
        ids.push(id)
        await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, hashed])
        return { id, email, name }
      }
      const stored = async (id: string) => {
        const { rows } = await pool.query<Stored>('SELECT owner_id AS "ownerId", garden_id AS "gardenId", place, request_id AS "requestId", name, species, born, died, story, is_anonymous AS "isAnonymous" FROM memorials WHERE id = $1', [id])
        return rows[0]!
      }
      await use({ owner: await member(), other: await member(), stored })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = ANY($1::text[])', [ids])
      await pool.end()
    }
  }
})

async function signIn(request: APIRequestContext, member: Member) {
  expect((await signInFixture(request, { origin, email: member.email, password })).ok()).toBe(true)
}

async function create(request: APIRequestContext, place: number) {
  const response = await request.post('/api/memorials', { headers: { origin }, data: { name: 'A familiar friend', species: 'cat', born: 2011, died: 2024,
    story: 'An old memory, kept in a quiet corner.', isAnonymous: true, gardenId: 'grove', place, requestId: randomUUID() } })
  expect(response.status()).toBe(201)
  return response.json() as Promise<{ id: string, gardenId: string, place: number }>
}

async function profile(page: Page, ru: boolean, isMobile: boolean) {
  const trigger = page.getByTestId('garden-account-menu')
  if (isMobile) await trigger.tap()
  else await trigger.hover()
  await page.getByRole('menuitem', { name: ru ? 'Профиль' : 'Profile', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: owner edits an existing memorial, keeps its place and controls public attribution`, async ({ page, members, browser, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    // Existing creation fixtures use grove 3/4 and auto-allocation starts there.
    const place = (ru ? 10 : 12) + Number(isMobile)
    await signIn(page.request, members.owner)
    const memorial = await create(page.request, place)
    const original = await members.stored(memorial.id)
    const url = `/gardens?garden=grove&memorial=${memorial.id}`
    const editUrl = `/memorials/${memorial.id}/edit`
    const labels = { name: ru ? 'Имя питомца' : 'Pet’s name', born: ru ? 'Год рождения' : 'Year of birth', died: ru ? 'Год ухода' : 'Year of passing',
      story: ru ? 'История питомца' : 'Your pet’s story', anonymous: ru ? 'Остаться анонимным' : 'Remain anonymous' }

    // Populate the account cache before editing so a stale list is observable later.
    await visitLocale(page, '/account', locale)
    await page.locator('.account-memorial-card').filter({ hasText: 'A familiar friend' }).click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('A familiar friend')
    const stone = page.getByTestId(`memorial-${memorial.id}`)
    const position = () => stone.evaluate(element => {
      const slot = element.closest<HTMLElement>('.memorial-position')!
      return { x: slot.dataset.worldX, y: slot.dataset.worldY, chunk: slot.dataset.chunkId }
    })
    const initialPosition = await position()
    await expect(page.getByTestId('memorial-edit')).toHaveAccessibleName(ru ? 'Редактировать место памяти' : 'Edit memorial')
    const pattern = `**/api/memorials/${memorial.id}`
    await page.route(pattern, route => route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Memorials unavailable' } }) : route.continue())
    await page.getByTestId('memorial-edit').click()
    await expect(page).toHaveURL(new URL(editUrl, origin).href)
    await expect(page.getByTestId('memorial-edit-state')).toBeVisible()
    await expect(page.getByTestId('memorial-edit-form')).toHaveCount(0)
    const retry = page.getByTestId('memorial-edit-state').getByRole('button', { name: ru ? 'Попробовать ещё раз' : 'Try again', exact: true })
    await expect(retry).toBeVisible()
    await page.unroute(pattern)
    await retry.click()
    await expect(page.getByTestId('memorial-edit-page')).toBeVisible()
    const form = page.getByTestId('memorial-edit-form')
    await expect(form).toBeVisible()
    await expect(form.getByLabel(labels.name, { exact: true })).toHaveValue('A familiar friend')
    await expect(form.getByTestId('memorial-species')).toContainText(ru ? 'Кошка' : 'Cat')
    await expect(form.getByLabel(labels.born, { exact: true })).toHaveValue('2011')
    await expect(form.getByLabel(labels.died, { exact: true })).toHaveValue('2024')
    await expect(form.getByLabel(labels.story, { exact: true })).toHaveValue('An old memory, kept in a quiet corner.')
    await expect(form.getByRole('checkbox', { name: labels.anonymous, exact: true })).toBeChecked()
    await expect(form.locator('select[name="gardenId"]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await form.getByLabel(labels.name, { exact: true }).fill('An unsaved name')
    await page.getByTestId('memorial-edit-cancel').click()
    await expect(page).toHaveURL(new URL(url, origin).href)
    await expect(page.getByRole('dialog')).toHaveAccessibleName('A familiar friend')
    expect(await members.stored(memorial.id)).toEqual(original)
    await page.getByTestId('memorial-edit').click()
    await expect(form).toBeVisible()

    const name = form.getByLabel(labels.name, { exact: true })
    await name.fill('')
    await page.getByTestId('memorial-edit-save').click()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()
    const updatedName = ru ? 'Солнечный друг' : 'Sunny friend'
    const updatedStory = ru ? 'Любил тёплые дорожки.\nИ всегда ждал нас у двери.' : 'Loved the sunny paths.\nAnd always waited by the door.'
    await name.fill(updatedName)
    await choosePetSpecies(page, locale, ru ? 'Змея' : 'Snake', !isMobile)
    await form.getByLabel(labels.born, { exact: true }).fill('2010')
    await form.getByLabel(labels.died, { exact: true }).fill('2025')
    await form.getByLabel(labels.story, { exact: true }).fill(updatedStory)
    const anonymous = form.getByRole('checkbox', { name: labels.anonymous, exact: true })
    await anonymous.click()
    await expect(anonymous).not.toBeChecked()
    await page.route(pattern, route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Memorial storage unavailable' } }) : route.continue())
    await page.getByTestId('memorial-edit-save').click()
    await expect(form.getByRole('alert')).toContainText(ru ? 'Не удалось сохранить изменения.' : 'We could not save your changes.')
    await expect(name).toHaveValue(updatedName)
    await expect(form.getByTestId('memorial-species')).toContainText(ru ? 'Змея' : 'Snake')
    await expect(form.getByLabel(labels.story, { exact: true })).toHaveValue(updatedStory)
    await expect(anonymous).not.toBeChecked()
    expect(await members.stored(memorial.id)).toEqual(original)
    await page.screenshot({ path: testInfo.outputPath('memorial-edit-draft.png'), animations: 'disabled' })
    await page.unroute(pattern)
    const [request] = await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname === `/api/memorials/${memorial.id}` && request.method() === 'PATCH'),
      page.getByTestId('memorial-edit-save').click()
    ])
    expect(request.postDataJSON()).toEqual({ name: updatedName, species: 'snake', born: 2010, died: 2025, story: updatedStory, isAnonymous: false })
    await expect(page).toHaveURL(new URL(url, origin).href)
    await expect(page.getByRole('dialog')).toHaveAccessibleName(updatedName)
    await expect(page.getByRole('dialog').locator('.pet-species-icon')).toHaveAttribute('data-species', 'snake')
    await expect(page.getByRole('dialog').locator('.memorial-story')).toContainText(updatedStory)
    await expect(page.getByTestId('memorial-creator')).toContainText(members.owner.name)
    expect(await position()).toEqual(initialPosition)
    const after = await members.stored(memorial.id)
    expect(after.species).toBe('snake')
    for (const field of ['ownerId', 'gardenId', 'place', 'requestId'] as const) expect(after[field]).toBe(original[field])
    await page.keyboard.press('Escape')
    await profile(page, ru, isMobile)
    await expect(page.locator('.account-memorial-card')).toContainText(updatedName)
    await expect(page.locator('.account-memorial-card')).not.toContainText('A familiar friend')
    await page.locator('.account-memorial-card').click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName(updatedName)
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveAccessibleName(updatedName)

    // Attribution can be hidden again without removing the owner's edit access.
    await page.getByTestId('memorial-edit').click()
    await expect(form.getByTestId('memorial-species')).toContainText(ru ? 'Змея' : 'Snake')
    await expect(anonymous).not.toBeChecked()
    await anonymous.click()
    await page.getByTestId('memorial-edit-save').click()
    await expect(page).toHaveURL(new URL(url, origin).href)
    await expect(page.getByTestId('memorial-creator')).toContainText(ru ? 'Анонимно' : 'Anonymous')
    await expect(page.getByTestId('memorial-edit')).toBeVisible()
    const privateRecord = await (await page.request.get(`/api/memorials/${memorial.id}`)).json()
    expect(privateRecord).toMatchObject({ name: updatedName, born: 2010, died: 2025, isAnonymous: true, gardenId: 'grove', place, canEdit: true })

    const guest = await browser.newContext({ baseURL: origin })
    const foreign = await browser.newContext({ baseURL: origin })
    try {
      const visitor = await guest.newPage()
      await visitLocale(visitor, url, locale)
      await expect(visitor.getByRole('dialog')).toHaveAccessibleName(updatedName)
      await expect(visitor.getByRole('dialog').locator('.pet-species-icon')).toHaveAttribute('data-species', 'snake')
      await expect(visitor.getByTestId('memorial-edit')).toHaveCount(0)
      const publicRows = await (await guest.request.get('/api/gardens/grove/memorials')).json()
      const publicRecord = publicRows.find((item: { id: string }) => item.id === memorial.id)
      expect(publicRecord).toMatchObject({ creatorName: null, canEdit: false })
      for (const key of ['ownerId', 'email', 'requestId', 'isAnonymous']) expect(publicRecord).not.toHaveProperty(key)
      for (const secret of [members.owner.id, members.owner.email, members.owner.name]) expect(JSON.stringify(publicRecord)).not.toContain(secret)
      expect((await guest.request.get(`/api/memorials/${memorial.id}`)).status()).toBe(401)
      await visitLocale(visitor, editUrl, locale)
      await expect(visitor).toHaveURL(/\/login\?redirect=/)
      expect(new URL(visitor.url()).searchParams.get('redirect')).toBe(editUrl)

      await signIn(foreign.request, members.other)
      const other = await foreign.newPage()
      await visitLocale(other, url, locale)
      await expect(other.getByRole('dialog')).toHaveAccessibleName(updatedName)
      await expect(other.getByTestId('memorial-edit')).toHaveCount(0)
      await visitLocale(other, editUrl, locale)
      await expect(other.getByTestId('memorial-edit-state')).toContainText(ru ? 'Это место памяти недоступно для редактирования' : 'This memorial is not available for editing')
      await expect(other.getByTestId('memorial-edit-form')).toHaveCount(0)
      await visitLocale(page, '/gardens?garden=grove&memorial=grove-1', locale)
      await expect(page.getByRole('dialog').locator('.memorial-demo')).toBeVisible()
      await expect(page.getByTestId('memorial-edit')).toHaveCount(0)
    } finally { await guest.close(); await foreign.close() }
  })
}

test('editing API enforces ownership, validates content and rejects placement or identity changes', async ({ page, members, browser, isMobile }) => {
  test.skip(isMobile, 'Server authorization does not depend on the viewport')
  await signIn(page.request, members.owner)
  const memorial = await create(page.request, 14)
  const before = await members.stored(memorial.id)
  const path = `/api/memorials/${memorial.id}`
  const body = { name: '  Updated friend  ', species: 'turtle', born: 2010, died: 2025, story: '  The same place, with a new memory.  ', isAnonymous: false }
  const patch = (data: unknown, headers = { origin }) => page.request.patch(path, { headers, data })
  const guest = await browser.newContext({ baseURL: origin })
  const foreign = await browser.newContext({ baseURL: origin })
  try {
    expect((await guest.request.patch(path, { headers: { origin }, data: body })).status()).toBe(401)
    await signIn(foreign.request, members.other)
    expect((await foreign.request.get(path)).status()).toBe(404)
    expect((await foreign.request.patch(path, { headers: { origin }, data: body })).status()).toBe(404)
    expect((await patch(body, { origin: 'https://untrusted.example' })).status()).toBe(403)
    expect((await page.request.patch(path, { headers: { origin, 'content-type': 'text/plain' }, data: JSON.stringify(body) })).status()).toBe(415)
    expect((await page.request.get('/api/memorials/not-a-uuid')).status()).toBe(400)
    expect((await page.request.patch('/api/memorials/not-a-uuid', { headers: { origin }, data: body })).status()).toBe(400)
    expect((await page.request.get(`/api/memorials/${randomUUID()}`)).status()).toBe(404)
    expect((await page.request.patch(`/api/memorials/${randomUUID()}`, { headers: { origin }, data: body })).status()).toBe(404)
    for (const invalid of [
      { ...body, name: ' ' }, { ...body, name: 'x'.repeat(81) }, { ...body, story: '' }, { ...body, story: 'x'.repeat(5001) },
      { ...body, species: 'dragon' }, { ...body, species: undefined }, { ...body, species: null },
      { ...body, born: 2026, died: 2025 }, { ...body, died: new Date().getUTCFullYear() + 1 },
      { ...body, isAnonymous: 'true' }, { ...body, isAnonymous: null }, { ...body, isAnonymous: undefined },
      { ...body, ownerId: members.other.id }, { ...body, gardenId: 'lake' }, { ...body, place: 15 }, { ...body, requestId: randomUUID() },
      { ...body, creatorName: 'Forged author' }, { ...body, canEdit: true }
    ]) expect((await patch(invalid)).status()).toBe(400)
    expect(await members.stored(memorial.id)).toEqual(before)
    const response = await patch(body)
    expect(response.ok()).toBe(true)
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(await response.json()).toMatchObject({ id: memorial.id, name: 'Updated friend', story: 'The same place, with a new memory.', gardenId: 'grove', place: 14, creatorName: members.owner.name, canEdit: true })
    const after = await members.stored(memorial.id)
    expect(after.species).toBe('turtle')
    for (const field of ['ownerId', 'gardenId', 'place', 'requestId'] as const) expect(after[field]).toBe(before[field])
    expect((await page.request.get(path)).headers()['cache-control']).toContain('no-store')
  } finally { await guest.close(); await foreign.close() }
})
