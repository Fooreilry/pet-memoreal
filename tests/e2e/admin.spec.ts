import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { getPermissions, userRoles } from '../../shared/roles'
import type { UserRole } from '../../shared/roles'
import { gardenIds } from '../../shared/gardens'
import { signInFixture } from './helpers/sign-in'
import { visitLocale } from './helpers/locale'
import { getAdminConfig, seedInitialAdmin } from '../../scripts/db/admin-data'
import * as databaseSchema from '../../server/db/schema'

const origin = 'http://127.0.0.1:4173'
const password = 'Admin-permissions-fixture-2026!'
type Member = { id: string, email: string, name: string, role: UserRole }
type Memorial = { id: string, gardenId: string, place: number, name: string }
type Fixtures = {
  pool: pg.Pool
  member: (role: UserRole) => Promise<Member>
  memorial: (owner: Member, role: UserRole, mobile: boolean, reservedPlace?: number) => Promise<Memorial>
}

const test = base.extend<{ records: Fixtures }>({
  records: async ({ baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Administrative fixtures require the temporary local E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const ids: string[] = []
    try {
      const hashed = await hashPassword(password)
      async function member(role: UserRole) {
        const id = randomUUID(), email = `administration-${id}@example.test`, name = `Keeper ${id.slice(0, 8)}`
        await pool.query('INSERT INTO auth_user (id, name, email, email_verified, role) VALUES ($1, $2, $3, true, $4)', [id, name, email, role])
        ids.push(id)
        await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, hashed])
        return { id, email, name, role }
      }
      async function memorial(owner: Member, role: UserRole, mobile: boolean, reservedPlace?: number) {
        // Reserved demo places cannot be taken by ordinary creation journeys.
        const gardenId = gardenIds[userRoles.indexOf(role)]!
        const place = reservedPlace ?? (mobile ? 2 : 1)
        const id = randomUUID(), name = `Memory ${id.slice(0, 8)}`
        await pool.query(`INSERT INTO memorials (id, owner_id, garden_id, place, name, species, born, died, story, is_anonymous, request_id)
          SELECT $1, $2, id, $3, $4, 'cat', 2011, 2024, 'A private memory of a sunny friend.', true, $5 FROM gardens WHERE slug = $6`,
        [id, owner.id, place, name, randomUUID(), gardenId])
        return { id, gardenId, place, name }
      }
      await use({ pool, member, memorial })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = ANY($1::text[])', [ids])
      await pool.end()
    }
  }
})

async function signIn(request: APIRequestContext, member: Member) {
  expect((await signInFixture(request, { origin, email: member.email, password })).ok()).toBe(true)
}

async function userPage(request: APIRequestContext, id: string) {
  for (let page = 1; page <= 10; page++) {
    const response = await request.get(`/api/admin/overview?usersPage=${page}`)
    expect(response.status()).toBe(200)
    const data = await response.json()
    if (data.users.some((user: { id: string }) => user.id === id)) return page
    if (page * data.pageSize >= data.totals.users) break
  }
  throw new Error('Fixture user was not found in administrative pagination')
}

const changes = { name: 'A treasured friend', species: 'dog', born: 2010, died: 2025, story: 'A new and lasting memory.', isAnonymous: true }

test('initial administrator provisioned from configuration can sign in without a verification email', async ({ page, records }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Bootstrap uses the same authentication flow on every viewport')
  const config = getAdminConfig({ ADMIN_EMAIL: `initial-admin-${randomUUID()}@example.test`, ADMIN_PASSWORD: password, ADMIN_NAME: 'Initial administrator' })!
  const db = drizzle({ client: records.pool, schema: databaseSchema })
  try {
    expect(await seedInitialAdmin(db, config)).toBe('created')
    expect(await seedInitialAdmin(db, { ...config, password: 'Another-secure-password-2026!' })).toBe('existing')
    // The original password remains valid after an idempotent seed retry.
    expect((await signInFixture(page.request, { origin, email: config.email, password })).ok()).toBe(true)
    const me = await page.request.get('/api/me')
    expect(await me.json()).toMatchObject({ email: config.email, emailVerified: true, role: 'admin', permissions: getPermissions('admin') })
    await visitLocale(page, '/account', 'ru')
    await page.getByTestId('admin-profile-link').click()
    await expect(page.getByTestId('admin-page')).toBeVisible()
    await expect(page.getByTestId('admin-create-memorial')).toBeVisible()
  } finally {
    await records.pool.query('DELETE FROM auth_user WHERE email = $1', [config.email])
  }
})

for (const role of userRoles) {
  test(`${role}: profile navigation, administrative controls and memorial permissions agree`, async ({ page, records, isMobile }, testInfo) => {
    const member = await records.member(role)
    const owner = await records.member('user')
    const memorial = await records.memorial(owner, role, isMobile)
    await signIn(page.request, member)
    const me = await page.request.get('/api/me')
    expect(await me.json()).toMatchObject({ role, permissions: getPermissions(role) })
    const overview = await page.request.get('/api/admin/overview')
    expect(overview.headers()['cache-control']).toContain('no-store')
    const editable = role !== 'user'
    const read = await page.request.get(`/api/memorials/${memorial.id}`)
    expect(read.status()).toBe(editable ? 200 : 404)
    const publicMemorials = await (await page.request.get(`/api/gardens/${memorial.gardenId}/memorials`)).json()
    expect(publicMemorials.find((item: { id: string }) => item.id === memorial.id)).toMatchObject({ creatorName: null, canEdit: editable })

    await visitLocale(page, '/account', isMobile ? 'en' : 'ru')
    if (role === 'user') {
      expect(overview.status()).toBe(403)
      await expect(page.getByTestId('admin-profile-link')).toHaveCount(0)
      await visitLocale(page, '/admin', 'ru')
      await expect(page).toHaveURL(/\/account$/)
      await expect(page.getByTestId('admin-page')).toHaveCount(0)
    } else {
      expect(overview.status()).toBe(200)
      const data = await overview.json()
      expect(data).toMatchObject({ permissions: getPermissions(role), usersPage: 1, memorialsPage: 1, pageSize: 20 })
      expect(data.users.length).toBeLessThanOrEqual(20)
      expect(JSON.stringify(data)).not.toContain('password')
      expect(JSON.stringify(data)).not.toContain('accessToken')
      await page.getByTestId('admin-profile-link').click()
      await expect(page).toHaveURL(/\/admin$/)
      await expect(page.getByTestId('admin-page')).toBeVisible()
      const access = page.locator('.admin-access')
      await expect(access.locator('dl')).toBeHidden()
      await access.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(access.locator('dl')).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(access.locator('dl')).toBeHidden()
      // Other viewport workers may create pagination fixtures concurrently.
      const usersPage = await userPage(page.request, member.id)
      if (usersPage !== 1) await page.goto(`/admin?usersPage=${usersPage}`)
      await expect(page.getByTestId(`admin-users-row-${member.id}`)).toContainText(member.email)
      await expect(page.getByTestId(`admin-memorial-row-${memorial.id}`)).toContainText(memorial.name)
      if (role === 'developer') await expect(page.getByTestId(`admin-memorial-edit-${memorial.id}`)).toHaveCount(0)
      else await expect(page.getByTestId(`admin-memorial-edit-${memorial.id}`)).toBeVisible()
      if (role === 'admin') {
        await expect(page.getByTestId(`admin-memorial-delete-${memorial.id}`)).toBeVisible()
        await expect(page.getByTestId('admin-create-memorial')).toBeVisible()
        await expect(page.getByTestId(`admin-role-${member.id}`)).toBeDisabled()
      } else {
        await expect(page.getByTestId(`admin-memorial-delete-${memorial.id}`)).toHaveCount(0)
        await expect(page.getByTestId('admin-create-memorial')).toHaveCount(0)
        await expect(page.getByTestId(`admin-role-${owner.id}`)).toHaveCount(0)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${role}-admin.png`), fullPage: !isMobile, scale: 'css', animations: 'disabled' })
      if (role === 'manager' || role === 'admin') {
        await page.getByTestId(`admin-memorial-edit-${memorial.id}`).click()
        await expect(page).toHaveURL(new RegExp(`/memorials/${memorial.id}/edit$`))
        const form = page.getByTestId('memorial-edit-form')
        await expect(form).toBeVisible()
        await form.getByLabel(isMobile ? 'Pet’s name' : 'Имя питомца', { exact: true }).fill(`Remembered by ${role}`)
        await page.getByTestId('memorial-edit-save').click()
        await expect(page.getByRole('dialog')).toHaveAccessibleName(`Remembered by ${role}`)
      }
    }

    const update = await page.request.patch(`/api/memorials/${memorial.id}`, { headers: { origin }, data: changes })
    expect(update.status()).toBe(editable ? 200 : 404)
    if (editable) {
      const tampered = await page.request.patch(`/api/memorials/${memorial.id}`, { headers: { origin }, data: { ...changes, ownerId: member.id } })
      expect(tampered.status()).toBe(400)
      const attributed = await page.request.patch(`/api/memorials/${memorial.id}`, { headers: { origin }, data: { ...changes, isAnonymous: false } })
      expect(attributed.status()).toBe(200)
      expect(await attributed.json()).toMatchObject({ creatorName: owner.name })
      const restored = await page.request.patch(`/api/memorials/${memorial.id}`, { headers: { origin }, data: changes })
      expect(restored.status()).toBe(200)
      expect(await restored.json()).toMatchObject({ creatorName: null })
    }
    const stored = await records.pool.query('SELECT name, owner_id, place, is_anonymous FROM memorials WHERE id = $1', [memorial.id])
    expect(stored.rows[0]).toMatchObject({ name: editable ? changes.name : memorial.name, owner_id: owner.id, place: memorial.place, is_anonymous: true })
    const assignment = await page.request.patch(`/api/admin/users/${owner.id}`, { headers: { origin }, data: { role: 'developer' } })
    expect(assignment.status()).toBe(role === 'admin' ? 200 : 403)
    const deletion = await page.request.delete(`/api/admin/memorials/${memorial.id}`, { headers: { origin } })
    expect(deletion.status()).toBe(role === 'admin' ? 200 : 403)
  })
}

test('administrative endpoints require a verified session and reject forged roles', async ({ page, records }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server authorization is independent of viewport')
  const id = randomUUID()
  for (const response of [
    await page.request.get('/api/admin/overview', { headers: { 'x-user-role': 'admin' } }),
    await page.request.patch(`/api/admin/users/${id}`, { headers: { origin }, data: { role: 'admin' } }),
    await page.request.delete(`/api/admin/memorials/${id}`, { headers: { origin } })
  ]) expect(response.status()).toBe(401)
  const member = await records.member('user')
  await signIn(page.request, member)
  expect((await page.request.get('/api/admin/overview', { headers: { 'x-user-role': 'admin', 'x-admin-panel': '3' } })).status()).toBe(403)
  await visitLocale(page, '/admin', 'en')
  await expect(page).toHaveURL(/\/account$/)
})

test('administrator changes another role and existing sessions immediately use the current database grant', async ({ page, records, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server role changes are independent of viewport')
  const admin = await records.member('admin')
  const target = await records.member('user')
  const context = await browser.newContext({ baseURL: origin })
  try {
    await signIn(page.request, admin)
    await signIn(context.request, target)
    const initial = await context.request.get('/api/me')
    expect(await initial.json()).toMatchObject({ role: 'user', permissions: getPermissions('user') })
    const wrongOrigin = await page.request.patch(`/api/admin/users/${target.id}`, { headers: { origin: 'https://untrusted.example' }, data: { role: 'admin' } })
    expect(wrongOrigin.status()).toBe(403)
    const self = await page.request.patch(`/api/admin/users/${admin.id}`, { headers: { origin }, data: { role: 'user' } })
    expect(self.status()).toBe(409)
    for (const data of [{ role: 'owner' }, { role: 'admin', permissions: { adminPanel: 3 } }, { role: 'admin', emailVerified: true }]) {
      const invalid = await page.request.patch(`/api/admin/users/${target.id}`, { headers: { origin }, data })
      expect(invalid.status()).toBe(400)
    }
    expect((await page.request.patch(`/api/admin/users/${randomUUID()}`, { headers: { origin }, data: { role: 'user' } })).status()).toBe(404)
    const promote = await page.request.patch(`/api/admin/users/${target.id}`, { headers: { origin }, data: { role: 'developer' } })
    expect(promote.status()).toBe(200)
    expect(await (await context.request.get('/api/me')).json()).toMatchObject({ role: 'developer', permissions: getPermissions('developer') })
    expect((await context.request.get('/api/admin/overview')).status()).toBe(200)
    // A session created while privileged must lose access without signing in again.
    await records.pool.query('UPDATE auth_user SET role = $1 WHERE id = $2', ['manager', target.id])
    expect(await (await context.request.get('/api/me')).json()).toMatchObject({ role: 'manager', permissions: getPermissions('manager') })
    const demote = await page.request.patch(`/api/admin/users/${target.id}`, { headers: { origin }, data: { role: 'user' } })
    expect(demote.status()).toBe(200)
    expect(await (await context.request.get('/api/me')).json()).toMatchObject({ role: 'user', permissions: getPermissions('user') })
    expect((await context.request.get('/api/admin/overview')).status()).toBe(403)
  } finally { await context.close() }
})

test('administrative data is paginated and malformed page requests are rejected', async ({ page, records }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Pagination query validation is enforced by the server')
  const admin = await records.member('admin')
  for (let index = 0; index < 21; index++) await records.member('user')
  await signIn(page.request, admin)
  const first = await page.request.get('/api/admin/overview')
  const firstPage = await first.json()
  expect(firstPage.users).toHaveLength(20)
  expect(firstPage.totals.users).toBeGreaterThanOrEqual(22)
  const second = await page.request.get('/api/admin/overview?usersPage=2')
  const secondPage = await second.json()
  expect(secondPage.usersPage).toBe(2)
  expect(secondPage.users.length).toBeGreaterThan(0)
  expect(secondPage.users.length).toBeLessThanOrEqual(20)
  expect(secondPage.pageSize).toBe(20)
  expect(secondPage.totals.users).toBeGreaterThanOrEqual(22)
  for (const query of ['usersPage=0', 'memorialsPage=-1', 'usersPage=1.5', 'usersPage=1000001', 'role=admin']) {
    expect((await page.request.get(`/api/admin/overview?${query}`)).status()).toBe(400)
  }
})

test('concurrent administrators cannot demote each other into a state with no administrator', async ({ page, records, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Concurrent role writes are a database authorization scenario')
  const first = await records.member('admin')
  const second = await records.member('admin')
  const context = await browser.newContext({ baseURL: origin })
  try {
    await signIn(page.request, first)
    await signIn(context.request, second)
    const responses = await Promise.all([
      page.request.patch(`/api/admin/users/${second.id}`, { headers: { origin }, data: { role: 'user' } }),
      context.request.patch(`/api/admin/users/${first.id}`, { headers: { origin }, data: { role: 'user' } })
    ])
    expect(responses.map(response => response.status()).sort()).toEqual([200, 403])
    const remaining = await records.pool.query('SELECT id, role FROM auth_user WHERE id = ANY($1::text[])', [[first.id, second.id]])
    expect(remaining.rows.filter(user => user.role === 'admin')).toHaveLength(1)
    const firstRole = remaining.rows.find(user => user.id === first.id)!.role
    const secondRole = remaining.rows.find(user => user.id === second.id)!.role
    expect((await page.request.get('/api/admin/overview')).status()).toBe(firstRole === 'admin' ? 200 : 403)
    expect((await context.request.get('/api/admin/overview')).status()).toBe(secondRole === 'admin' ? 200 : 403)
  } finally { await context.close() }
})

test('administrator can enter creation, cancel deletion and confirm deletion from the panel', async ({ page, records, isMobile }, testInfo) => {
  const admin = await records.member('admin')
  const owner = await records.member('user')
  const memorial = await records.memorial(owner, 'admin', isMobile, isMobile ? 14 : 7)
  await signIn(page.request, admin)
  await visitLocale(page, '/admin', isMobile ? 'en' : 'ru')
  await page.getByTestId('admin-create-memorial').click()
  await expect(page).toHaveURL(/\/memorials\/new$/)
  await expect(page.getByTestId('memorial-create-form')).toBeVisible()
  await visitLocale(page, '/admin', isMobile ? 'en' : 'ru')
  const usersPage = await userPage(page.request, owner.id)
  if (usersPage !== 1) await page.goto(`/admin?usersPage=${usersPage}`)
  const roleSelect = page.getByTestId(`admin-role-${owner.id}`)
  await roleSelect.focus()
  await page.keyboard.press('Enter')
  const roleOptions = page.getByRole('listbox')
  await expect(roleOptions).toBeVisible()
  // Measure the settled popup rather than its brief entry-scale animation.
  await expect.poll(async () => {
    const triggerBox = (await roleSelect.boundingBox())!
    const popupBox = (await roleOptions.boundingBox())!
    return Math.max(Math.abs(popupBox.width - triggerBox.width), Math.abs(popupBox.x - triggerBox.x))
  }).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('admin-role-select.png'), scale: 'css', animations: 'disabled' })
  await expect(page.getByRole('option', { name: isMobile ? 'User' : 'Пользователь', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: isMobile ? 'Manager' : 'Менеджер', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(roleSelect).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await expect(roleOptions).toHaveCount(0)
  const roleRequests: string[] = []
  page.on('request', request => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/admin/users/${owner.id}`)) roleRequests.push(request.url())
  })
  await page.getByTestId(`admin-role-save-${owner.id}`).click()
  const confirmation = page.getByRole('dialog')
  await expect(confirmation).toHaveAccessibleName(isMobile ? 'Change this user’s role?' : 'Изменить роль пользователя?')
  await expect(confirmation).toContainText(owner.name)
  await expect(confirmation).toContainText(isMobile ? 'View and edit' : 'Просмотр и редактирование')
  const cancelRole = confirmation.getByRole('button', { name: isMobile ? 'Cancel' : 'Отмена', exact: true })
  await expect(cancelRole).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('admin-role-confirm.png'), scale: 'css', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(page.getByTestId(`admin-role-save-${owner.id}`)).toBeFocused()
  expect(roleRequests).toEqual([])
  expect((await records.pool.query('SELECT role FROM auth_user WHERE id = $1', [owner.id])).rows[0].role).toBe('user')
  await page.route(`**/api/admin/users/${owner.id}`, route => route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Administration unavailable' } }), { times: 1 })
  await page.getByTestId(`admin-role-save-${owner.id}`).click()
  await page.getByTestId('admin-role-confirm').click()
  await expect(confirmation.getByRole('alert')).toContainText(isMobile ? 'We could not change the role' : 'Не удалось изменить роль')
  await expect(confirmation.locator('[data-slot="header"] [data-slot="title"]')).toHaveCSS('font-size', '24px')
  await expect(confirmation.getByRole('alert').locator('[data-slot="title"]')).toHaveCSS('font-size', '14px')
  await expect(page.getByTestId('admin-role-confirm')).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('admin-role-error.png'), scale: 'css', animations: 'disabled' })
  expect((await records.pool.query('SELECT role FROM auth_user WHERE id = $1', [owner.id])).rows[0].role).toBe('user')
  const roleSaved = page.waitForResponse(response => response.url().endsWith(`/api/admin/users/${owner.id}`) && response.request().method() === 'PATCH')
  await page.getByTestId('admin-role-confirm').click()
  expect((await roleSaved).status()).toBe(200)
  await expect(confirmation).toHaveCount(0)
  // Concurrent test workers can insert new people ahead of this paginated row.
  const updatedUsersPage = await userPage(page.request, owner.id)
  if (String(updatedUsersPage) !== new URL(page.url()).searchParams.get('usersPage')) await visitLocale(page, `/admin?usersPage=${updatedUsersPage}`, isMobile ? 'en' : 'ru')
  await expect(page.getByTestId(`admin-role-save-${owner.id}`)).toBeDisabled()
  expect((await records.pool.query('SELECT role FROM auth_user WHERE id = $1', [owner.id])).rows[0].role).toBe('manager')
  await page.getByTestId(`admin-memorial-delete-${memorial.id}`).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName(isMobile ? 'Delete this memorial?' : 'Удалить место памяти?')
  await expect(dialog.getByRole('button', { name: isMobile ? 'Cancel' : 'Отмена', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('admin-delete-confirm.png'), scale: 'css', animations: 'disabled' })
  await dialog.getByRole('button', { name: isMobile ? 'Cancel' : 'Отмена', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId(`admin-memorial-delete-${memorial.id}`)).toBeFocused()
  await expect(page.getByTestId(`admin-memorial-row-${memorial.id}`)).toBeVisible()
  await page.getByTestId(`admin-memorial-delete-${memorial.id}`).click()
  await page.getByTestId('admin-delete-confirm').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId(`admin-memorial-row-${memorial.id}`)).toHaveCount(0)
  await expect(page.locator('#admin-memorials-heading')).toBeFocused()
  expect((await records.pool.query('SELECT id FROM memorials WHERE id = $1', [memorial.id])).rowCount).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('admin-after-deletion.png'), fullPage: !isMobile, scale: 'css', animations: 'disabled' })
})

test('refresh keeps readable administrative data through a slow request, a failure and recovery', async ({ page, records, isMobile }, testInfo) => {
  const admin = await records.member('admin')
  const owner = await records.member('user')
  await signIn(page.request, admin)
  const usersPage = await userPage(page.request, owner.id)
  const snapshot = await (await page.request.get(`/api/admin/overview?usersPage=${usersPage}`)).json()
  await visitLocale(page, `/admin?usersPage=${usersPage}`, isMobile ? 'en' : 'ru')
  const row = page.getByTestId(`admin-users-row-${owner.id}`)
  const role = page.getByTestId(`admin-role-${owner.id}`)
  await expect(row).toBeVisible()
  let phase = 'slow'
  let releaseResponse = () => {}
  const waitForRelease = new Promise<void>((resolve) => { releaseResponse = resolve })
  await page.route('**/api/admin/overview**', async (route) => {
    if (phase === 'slow') {
      await waitForRelease
      return route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Administration unavailable' } })
    }
    return route.fulfill({ json: phase === 'empty' ? { ...snapshot, users: [], memorials: [], totals: { users: 0, memorials: 0 } } : snapshot })
  })
  const refresh = page.getByRole('button', { name: isMobile ? 'Refresh' : 'Обновить', exact: true })
  await refresh.click()
  await expect(page.getByText(isMobile ? 'Refreshing data. You can keep reading.' : 'Обновляем данные. Вы можете продолжать просмотр.', { exact: true })).toBeVisible()
  await expect(row).toBeVisible()
  await expect(role).toBeDisabled()
  await expect(page.locator('.admin-access')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('admin-refresh-loading.png'), scale: 'css', animations: 'disabled' })
  releaseResponse()
  await expect(page.getByRole('alert')).toContainText(isMobile ? 'We could not refresh the data' : 'Не удалось обновить данные')
  await expect(row).toBeVisible()
  await expect(role).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('admin-refresh-error.png'), scale: 'css', animations: 'disabled' })
  phase = 'recovered'
  await page.getByRole('button', { name: isMobile ? 'Try again' : 'Попробовать ещё раз', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(role).toBeEnabled()
  await expect(row).toContainText(owner.email)
  phase = 'empty'
  await refresh.click()
  await expect(page.getByText(isMobile ? 'No users on this page.' : 'На этой странице нет пользователей.', { exact: true })).toBeVisible()
  await expect(page.getByText(isMobile ? 'No places of remembrance on this page.' : 'На этой странице нет мест памяти.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('admin-empty.png'), fullPage: !isMobile, scale: 'css', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('uncommitted role choices are protected on refresh and navigation without changing permissions', async ({ page, records, isMobile }) => {
  const admin = await records.member('admin')
  for (let index = 0; index < 21; index++) await records.member('user')
  const owner = await records.member('user')
  await signIn(page.request, admin)
  const usersPage = await userPage(page.request, owner.id)
  await visitLocale(page, `/admin?usersPage=${usersPage}`, isMobile ? 'en' : 'ru')
  const role = page.getByTestId(`admin-role-${owner.id}`)
  const chooseManager = async () => {
    await role.click()
    await page.getByRole('option', { name: isMobile ? 'Manager' : 'Менеджер', exact: true }).click()
    await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  }
  await chooseManager()
  const guard = page.locator('.unsaved-changes-dialog[role="dialog"]')
  await page.getByTestId(usersPage > 1 ? 'admin-users-prev' : 'admin-users-next').click()
  await expect(guard).toBeVisible()
  await page.getByTestId('unsaved-keep').click()
  await expect(page).toHaveURL(new RegExp(`/admin\\?usersPage=${usersPage}$`))
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await page.getByRole('button', { name: isMobile ? 'Refresh' : 'Обновить', exact: true }).click()
  await expect(guard).toBeVisible()
  await page.getByTestId('unsaved-keep').click()
  await expect(guard).toHaveCount(0)
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await page.getByRole('button', { name: isMobile ? 'Refresh' : 'Обновить', exact: true }).click()
  const refreshed = page.waitForResponse(response => response.url().includes('/api/admin/overview') && response.request().method() === 'GET')
  await page.getByTestId('unsaved-discard').click()
  expect((await refreshed).status()).toBe(200)
  await expect(guard).toHaveCount(0)
  const refreshedUsersPage = await userPage(page.request, owner.id)
  if (String(refreshedUsersPage) !== new URL(page.url()).searchParams.get('usersPage')) await visitLocale(page, `/admin?usersPage=${refreshedUsersPage}`, isMobile ? 'en' : 'ru')
  await expect(role).toContainText(isMobile ? 'User' : 'Пользователь')
  await chooseManager()
  await page.locator('.admin-tabs a').click()
  await expect(guard).toBeVisible()
  await page.getByTestId('unsaved-keep').click()
  await expect(page).toHaveURL(/\/admin\?usersPage=\d+$/)
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await page.locator('.admin-tabs a').click()
  await page.getByTestId('unsaved-discard').click()
  await expect(page).toHaveURL(/\/account$/)
  expect((await records.pool.query('SELECT role FROM auth_user WHERE id = $1', [owner.id])).rows[0].role).toBe('user')
})

test('slow pagination labels the displayed snapshot and keeps role values until the new page arrives', async ({ page, records, isMobile }, testInfo) => {
  const admin = await records.member('admin')
  for (let index = 0; index < 21; index++) await records.member('user')
  const owner = await records.member('user')
  await signIn(page.request, admin)
  const usersPage = await userPage(page.request, owner.id)
  const nextPage = usersPage === 1 ? 2 : usersPage - 1
  const nextSnapshot = await (await page.request.get(`/api/admin/overview?usersPage=${nextPage}`)).json()
  await visitLocale(page, `/admin?usersPage=${usersPage}`, isMobile ? 'en' : 'ru')
  const role = page.getByTestId(`admin-role-${owner.id}`)
  await expect(role).toContainText(isMobile ? 'User' : 'Пользователь')
  let phase = 'slow'
  let releaseResponse = () => {}
  const waitForRelease = new Promise<void>((resolve) => { releaseResponse = resolve })
  await page.route('**/api/admin/overview**', async (route) => {
    if (phase === 'slow') {
      await waitForRelease
      return route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Administration unavailable' } })
    }
    return route.fulfill({ json: nextSnapshot })
  })
  const pagination = page.getByRole('navigation', { name: isMobile ? 'User list pages' : 'Страницы списка пользователей', exact: true })
  const displayedPage = pagination.getByRole('status')
  await page.getByTestId(usersPage === 1 ? 'admin-users-next' : 'admin-users-prev').click()
  await expect(page).toHaveURL(new RegExp(`/admin\\?usersPage=${nextPage}$`))
  await expect(page.getByText(isMobile ? 'Refreshing data. You can keep reading.' : 'Обновляем данные. Вы можете продолжать просмотр.', { exact: true })).toBeVisible()
  await expect(role).toContainText(isMobile ? 'User' : 'Пользователь')
  await expect(role).toBeDisabled()
  await expect(displayedPage).toContainText(`${isMobile ? 'Page' : 'Страница'} ${usersPage} `)
  await page.screenshot({ path: testInfo.outputPath('admin-pagination-loading.png'), scale: 'css', animations: 'disabled' })
  releaseResponse()
  await expect(page.getByRole('alert')).toContainText(isMobile ? 'We could not refresh the data' : 'Не удалось обновить данные')
  await expect(displayedPage).toContainText(`${isMobile ? 'Page' : 'Страница'} ${usersPage} `)
  await expect(page.getByTestId('admin-users-prev')).toBeDisabled()
  await expect(page.getByTestId('admin-users-next')).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('admin-pagination-error.png'), scale: 'css', animations: 'disabled' })
  phase = 'recovered'
  await page.getByRole('button', { name: isMobile ? 'Try again' : 'Попробовать ещё раз', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(displayedPage).toContainText(`${isMobile ? 'Page' : 'Страница'} ${nextPage} `)
  await expect(page.getByTestId(`admin-users-row-${nextSnapshot.users[0].id}`)).toBeVisible()
  await expect(page.locator('#users-heading')).toBeFocused()
})

test('deleting the final memorial on a page clamps only memorial paging and preserves an uncommitted role', async ({ page, records, isMobile }, testInfo) => {
  const admin = await records.member('admin')
  const owner = await records.member('user')
  const memorial = await records.memorial(owner, 'admin', isMobile, isMobile ? 8 : 6)
  await signIn(page.request, admin)
  const usersPage = await userPage(page.request, owner.id)
  const snapshot = await (await page.request.get(`/api/admin/overview?usersPage=${usersPage}`)).json()
  const target = snapshot.memorials.find((item: { id: string }) => item.id === memorial.id)
  expect(target).toBeTruthy()
  const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...target, id: randomUUID(), gardenId: gardenIds[index % gardenIds.length], place: Math.floor(index / gardenIds.length) + 1, name: `Saved memory ${index + 1}` }))
  await visitLocale(page, `/admin?usersPage=${usersPage}`, isMobile ? 'en' : 'ru')
  await page.route('**/api/admin/overview**', async (route) => {
    const selectedPage = Number(new URL(route.request().url()).searchParams.get('memorialsPage') ?? 1)
    const deleted = !(await records.pool.query('SELECT id FROM memorials WHERE id = $1', [memorial.id])).rowCount
    return route.fulfill({ json: { ...snapshot, memorialsPage: selectedPage, totals: { ...snapshot.totals, memorials: deleted ? 20 : 21 }, memorials: selectedPage === 1 ? firstPage : deleted ? [] : [target] } })
  })
  await page.getByRole('button', { name: isMobile ? 'Refresh' : 'Обновить', exact: true }).click()
  await expect(page.getByTestId('admin-memorials-next')).toBeEnabled()
  const role = page.getByTestId(`admin-role-${owner.id}`)
  await role.click()
  await page.getByRole('option', { name: isMobile ? 'Manager' : 'Менеджер', exact: true }).click()
  await page.getByTestId('admin-memorials-next').click()
  await expect(page).toHaveURL(/memorialsPage=2/)
  await expect(page.getByTestId('unsaved-changes-dialog')).toHaveCount(0)
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await expect(page.getByTestId(`admin-memorial-delete-${memorial.id}`)).toBeVisible()
  await page.getByTestId(`admin-memorial-delete-${memorial.id}`).click()
  await page.getByTestId('admin-delete-confirm').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/memorialsPage=/)
  await expect(page.getByTestId('unsaved-changes-dialog')).toHaveCount(0)
  await expect(page.getByTestId(`admin-memorial-row-${firstPage[0]!.id}`)).toBeVisible()
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await expect(page.getByTestId(`admin-role-save-${owner.id}`)).toBeEnabled()
  expect((await records.pool.query('SELECT id FROM memorials WHERE id = $1', [memorial.id])).rowCount).toBe(0)
  expect((await records.pool.query('SELECT role FROM auth_user WHERE id = $1', [owner.id])).rows[0].role).toBe('user')
  await page.locator('.admin-tabs a').click()
  await expect(page.getByTestId('unsaved-changes-dialog')).toBeVisible()
  await page.getByTestId('unsaved-keep').click()
  await expect(page).toHaveURL(/\/admin\?usersPage=\d+$/)
  await expect(role).toContainText(isMobile ? 'Manager' : 'Менеджер')
  await page.screenshot({ path: testInfo.outputPath('admin-clamped-with-role-draft.png'), scale: 'css', animations: 'disabled' })
})
