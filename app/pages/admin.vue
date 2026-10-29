<script setup lang="ts">
import { getPermissions, userRoles } from '#shared/roles'
import type { UserRole } from '#shared/roles'
import type { AdminOverview } from '#shared/admin'
import type { RouteLocationNormalized } from 'vue-router'

definePageMeta({ middleware: ['auth', 'admin'], colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const request = useRequestFetch()
const ready = ref(false)
const busy = ref('')
const actionError = ref('')
const saved = ref('')
const denied = ref(false)
const deleteTarget = ref<{ id: string, name: string } | null>(null)
const roleTarget = ref<{ id: string, name: string, from: UserRole, to: UserRole } | null>(null)
const lastOverview = shallowRef<AdminOverview | null>(null)
const dialogOrigin = shallowRef<HTMLElement | null>(null)
const dialogFallback = ref('users-heading')
const pendingSection = ref<'users' | 'memorials' | ''>('')
const roleDrafts = reactive<Record<string, UserRole>>({})
const usersPage = computed(() => pageNumber(route.query.usersPage))
const memorialsPage = computed(() => pageNumber(route.query.memorialsPage))
const { data: currentUser } = await useFetch('/api/me')
const { data: loadedData, error, status, refresh } = await useAsyncData('admin-overview', (_nuxtApp, { signal }) => request<AdminOverview>('/api/admin/overview', {
  query: { usersPage: usersPage.value, memorialsPage: memorialsPage.value }, retry: 0, signal
}), { watch: [usersPage, memorialsPage] })
const data = computed(() => loadedData.value ?? lastOverview.value)
const forbidden = computed(() => denied.value || [401, 403].includes(error.value?.statusCode ?? 0))
const canEdit = computed(() => !forbidden.value && (data.value?.permissions.adminPanel ?? 0) >= 2)
const canManage = computed(() => !forbidden.value && (data.value?.permissions.adminPanel ?? 0) >= 3)
const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (open: boolean) => { if (!open && !busy.value) deleteTarget.value = null } })
const roleOpen = computed({ get: () => !!roleTarget.value, set: (open: boolean) => { if (!open && !busy.value) roleTarget.value = null } })
const roleItems = computed(() => userRoles.map(value => ({ label: t(`admin.roles.${value}`), value })))
const proposedPermissions = computed(() => getPermissions(roleTarget.value?.to))
const gardenIcons = { meadow: 'i-lucide-flower-2', lake: 'i-lucide-waves', grove: 'i-lucide-trees', hill: 'i-lucide-mountain' }
const hasRoleDrafts = computed(() => !!data.value?.users.some(person => roleDrafts[person.id] && roleDrafts[person.id] !== person.role))
const guard = useUnsavedChangesGuard(() => hasRoleDrafts.value, () => !!busy.value, { guardUpdate: guardRoleOwnerChange })

watch(loadedData, (value, previous) => {
  if (!value) return
  const previousUsers = previous?.users ?? lastOverview.value?.users ?? []
  lastOverview.value = value
  for (const user of value.users) {
    const oldRole = previousUsers.find(person => person.id === user.id)?.role
    if (!roleDrafts[user.id] || roleDrafts[user.id] === oldRole) roleDrafts[user.id] = user.role
  }
}, { immediate: true })
watch([usersPage, memorialsPage], (value, previous) => {
  pendingSection.value = value[0] !== previous[0] ? 'users' : 'memorials'
  if (value[0] !== previous[0]) resetRoleDrafts()
})
watch(status, async (value) => {
  if (value !== 'success' || !pendingSection.value || !import.meta.client) return
  const heading = `${pendingSection.value === 'users' ? 'users' : 'admin-memorials'}-heading`
  pendingSection.value = ''
  await nextTick()
  document.getElementById(heading)?.focus()
})
onMounted(() => { ready.value = true })
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
useSeoMeta({ title: () => `${t('admin.title')} — PetMemoreal` })

function pageNumber(value: unknown) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1
}

function guardRoleOwnerChange(to: RouteLocationNormalized, from: RouteLocationNormalized) {
  if (to.path !== from.path) return true
  const keys = new Set([...Object.keys(to.query), ...Object.keys(from.query)])
  return [...keys].some(key => key !== 'memorialsPage' && JSON.stringify(to.query[key]) !== JSON.stringify(from.query[key]))
}

function resetRoleDrafts() {
  const users = data.value?.users ?? []
  const visibleIds = new Set(users.map(person => person.id))
  for (const id of Object.keys(roleDrafts)) if (!visibleIds.has(id)) Reflect.deleteProperty(roleDrafts, id)
  for (const person of users) roleDrafts[person.id] = person.role
}

function changePage(kind: 'users' | 'memorials', page: number) {
  if (error.value || status.value === 'pending') return
  return navigateTo({ path: localePath('/admin'), query: { ...route.query, [`${kind}Page`]: page === 1 ? undefined : String(page) } })
}

function refreshOverview() {
  return guard.requestDiscard(async () => {
    resetRoleDrafts()
    saved.value = ''
    await refresh()
  })
}

function requestRoleChange(person: AdminOverview['users'][number], event: MouseEvent) {
  const role = roleDrafts[person.id]
  if (!canManage.value || busy.value || error.value || status.value === 'pending' || !role || role === person.role || person.id === currentUser.value?.id) return
  actionError.value = ''
  dialogOrigin.value = event.currentTarget as HTMLElement
  dialogFallback.value = `admin-role-${person.id}`
  roleTarget.value = { id: person.id, name: [person.name, person.surname].filter(Boolean).join(' '), from: person.role, to: role }
}

function requestDeletion(memorial: { id: string, name: string }, event: MouseEvent) {
  if (!canManage.value || busy.value || error.value || status.value === 'pending') return
  actionError.value = ''
  dialogOrigin.value = event.currentTarget as HTMLElement
  dialogFallback.value = 'admin-memorials-heading'
  deleteTarget.value = { id: memorial.id, name: memorial.name }
}

function focusCancel(event: Event) {
  event.preventDefault()
  nextTick(() => document.querySelector<HTMLButtonElement>('[role="dialog"][data-state="open"] [data-admin-cancel]')?.focus())
}

function restoreDialogFocus(event: Event) {
  event.preventDefault()
  nextTick(() => {
    const origin = dialogOrigin.value
    if (origin?.isConnected && !origin.hasAttribute('disabled')) origin.focus()
    else (document.getElementById(dialogFallback.value) ?? document.querySelector<HTMLElement>(`[data-testid="${dialogFallback.value}"]`))?.focus()
    dialogOrigin.value = null
  })
}

function actionFailed(error: unknown, action: 'role' | 'delete') {
  const code = (error as { statusCode?: number }).statusCode
  if (code === 403 || code === 401) {
    denied.value = true
    actionError.value = 'admin.deniedDescription'
  } else actionError.value = code === 409 ? 'admin.conflict' : action === 'delete' ? 'admin.deleteError' : 'admin.roleError'
}

async function saveRole() {
  const target = roleTarget.value
  if (busy.value || !canManage.value || error.value || status.value === 'pending' || !target || target.id === currentUser.value?.id) return
  busy.value = target.id
  actionError.value = ''
  saved.value = ''
  try {
    await $fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, { method: 'PATCH', body: { role: target.to } })
    await refresh()
    roleTarget.value = null
    saved.value = t('admin.roleSaved', { name: target.name, role: t(`admin.roles.${target.to}`) })
  } catch (error) {
    actionFailed(error, 'role')
  } finally { busy.value = '' }
}

async function deleteMemorial() {
  const memorial = deleteTarget.value
  if (busy.value || !canManage.value || error.value || status.value === 'pending' || !memorial) return
  busy.value = memorial.id
  actionError.value = ''
  saved.value = ''
  try {
    await $fetch(`/api/admin/memorials/${encodeURIComponent(memorial.id)}`, { method: 'DELETE' })
    clearNuxtData(['map-memorials', 'my-memorials'])
    await refresh()
    let nextPage: number | undefined
    if (data.value && !data.value.memorials.length && memorialsPage.value > 1) {
      const lastPage = Math.max(1, Math.ceil(data.value.totals.memorials / data.value.pageSize))
      nextPage = Math.min(memorialsPage.value - 1, lastPage)
    }
    dialogOrigin.value = null
    deleteTarget.value = null
    saved.value = t('admin.memorialDeleted', { name: memorial.name })
    if (nextPage) {
      busy.value = ''
      await nextTick()
      await changePage('memorials', nextPage)
    }
  } catch (error) {
    actionFailed(error, 'delete')
  } finally { busy.value = '' }
}
</script>

<template>
  <div class="admin-page" data-testid="admin-page">
    <a href="#admin-main" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader />
    <main id="admin-main" class="admin-container" tabindex="-1">
      <nav class="admin-tabs" :aria-label="t('admin.navigation')">
        <NuxtLink :to="localePath('/account')">{{ t('account.profile') }}</NuxtLink>
        <span aria-current="page">{{ t('admin.title') }}</span>
      </nav>
      <div class="admin-heading">
        <div><h1>{{ t('admin.title') }}</h1><p>{{ t('admin.intro') }}</p></div>
        <UButton v-if="data && !forbidden" icon="i-lucide-refresh-cw" variant="outline" :loading="status === 'pending'" :disabled="!ready || !!busy || status === 'pending'" @click="refreshOverview">{{ t('admin.refresh') }}</UButton>
      </div>
      <div v-if="forbidden" class="admin-unavailable"><AppState kind="error" :title="t('admin.deniedTitle')" :description="t('admin.deniedDescription')" /><UButton :to="localePath('/account')" variant="outline">{{ t('account.profile') }}</UButton></div>
      <AppState v-else-if="error && !data" kind="error" retry @retry="refreshOverview" />
      <AppState v-else-if="status === 'pending' && !data" kind="loading" />
      <template v-else-if="data">
        <nav class="admin-section-nav" :aria-label="t('admin.pageSections')">
          <a href="#gardens-heading"><UIcon name="i-lucide-trees" aria-hidden="true" />{{ t('admin.gardens') }}</a>
          <a href="#users-heading"><UIcon name="i-lucide-users" aria-hidden="true" />{{ t('admin.users') }}<span>{{ data.totals.users }}</span></a>
          <a href="#admin-memorials-heading"><UIcon name="i-lucide-book-heart" aria-hidden="true" />{{ t('admin.memorials') }}<span>{{ data.totals.memorials }}</span></a>
        </nav>

        <div class="admin-feedback-region" :aria-busy="status === 'pending'">
          <UAlert v-if="error" color="warning" :title="t('admin.staleTitle')" :description="t('admin.staleDescription')" role="alert"><template #actions><UButton variant="outline" :disabled="status === 'pending'" @click="refreshOverview">{{ t('states.retry') }}</UButton></template></UAlert>
          <UAlert v-else-if="actionError && !roleOpen && !deleteOpen" color="error" :title="t(actionError)" role="alert" />
          <p v-else-if="status === 'pending'" class="admin-status" role="status"><UIcon name="i-lucide-loader-circle" class="animate-spin" aria-hidden="true" />{{ t('admin.refreshing') }}</p>
          <p v-else-if="saved" class="admin-saved" role="status"><UIcon name="i-lucide-check" aria-hidden="true" />{{ saved }}</p>
        </div>

        <details class="admin-access">
          <summary><span class="admin-access-overview"><span class="admin-access-label">{{ t('admin.access') }}</span><span class="admin-access-role"><UIcon name="i-lucide-shield-check" aria-hidden="true" />{{ t(`admin.roles.${currentUser?.role ?? 'user'}`) }}</span><span class="admin-access-hint">{{ t(`admin.accessHints.${data.permissions.adminPanel}`) }}</span></span><span class="admin-access-toggle">{{ t('admin.permissionDetails') }}<UIcon name="i-lucide-chevron-down" aria-hidden="true" /></span></summary>
          <dl>
            <div><dt>{{ t('admin.permissions.panel') }}</dt><dd>{{ t(`admin.panelLevels.${data.permissions.adminPanel}`) }}</dd></div>
            <div><dt>{{ t('admin.permissions.features') }}</dt><dd>{{ t(data.permissions.experimentalFeatures ? 'admin.enabled' : 'admin.disabled') }}</dd></div>
            <div><dt>{{ t('admin.permissions.configuration') }}</dt><dd>{{ t(`admin.configurationLevels.${data.permissions.configuration}`) }}</dd></div>
          </dl>
        </details>

        <section class="admin-section" aria-labelledby="gardens-heading">
          <h2 id="gardens-heading" tabindex="-1">{{ t('admin.gardens') }}</h2>
          <ul class="admin-gardens">
            <li v-for="garden in data.gardens" :key="garden.id"><NuxtLink :to="{ path: localePath('/gardens'), query: { garden: garden.id } }"><span class="admin-garden-name"><UIcon :name="gardenIcons[garden.id]" aria-hidden="true" />{{ t(`garden.names.${garden.id}`) }}</span><strong>{{ garden.occupied }} <span>/ {{ garden.capacity }}</span></strong><meter :min="0" :max="garden.capacity" :value="garden.occupied" :aria-label="t('admin.gardenOccupancy', { garden: t(`garden.names.${garden.id}`), occupied: garden.occupied, capacity: garden.capacity })" /><span class="admin-subtle">{{ t('admin.occupied') }}</span><UIcon name="i-lucide-arrow-up-right" class="admin-garden-arrow" aria-hidden="true" /></NuxtLink></li>
          </ul>
        </section>

        <section class="admin-section" aria-labelledby="users-heading">
          <div class="admin-section-heading"><div><h2 id="users-heading" tabindex="-1">{{ t('admin.users') }}<span>{{ data.totals.users }}</span></h2><p class="admin-section-description">{{ t(canManage ? 'admin.usersManageHint' : 'admin.usersReadHint') }}</p></div></div>
          <div class="admin-table-scroll" tabindex="0" role="region" :aria-label="t('admin.users')" :aria-busy="status === 'pending'">
            <table class="admin-table" role="table">
              <thead><tr><th scope="col">{{ t('admin.person') }}</th><th scope="col">{{ t('auth.email') }}</th><th scope="col">{{ t('admin.role') }}</th><th v-if="canManage" scope="col"><span class="sr-only">{{ t('admin.actions') }}</span></th></tr></thead>
              <tbody>
                <tr v-for="person in data.users" :key="person.id" :data-testid="`admin-users-row-${person.id}`">
                  <td><strong>{{ [person.name, person.surname].filter(Boolean).join(' ') }}</strong></td>
                  <td :data-label="t('auth.email')"><span>{{ person.email }}</span><span class="admin-subtle admin-email-state">{{ t(person.emailVerified ? 'account.verified' : 'admin.unverified') }}</span></td>
                  <td :data-label="t('admin.role')">
                    <div v-if="canManage" class="admin-role-control"><USelect :id="`admin-role-${person.id}`" v-model="roleDrafts[person.id]" :items="roleItems" :data-testid="`admin-role-${person.id}`" :aria-label="t('admin.roleFor', { name: person.name })" :aria-describedby="person.id === currentUser?.id ? `admin-self-${person.id}` : undefined" :disabled="!ready || !!busy || !!error || status === 'pending' || person.id === currentUser?.id" :content="{ position: 'popper', align: 'start', sideOffset: 6, collisionPadding: 12 }" class="admin-role-select" /><span v-if="person.id === currentUser?.id" :id="`admin-self-${person.id}`" class="admin-subtle admin-self-note">{{ t('admin.ownRole') }}</span></div>
                    <span v-else class="admin-role-label">{{ t(`admin.roles.${person.role}`) }}</span>
                  </td>
                  <td v-if="canManage"><UButton :data-testid="`admin-role-save-${person.id}`" variant="outline" :disabled="!ready || !!busy || !!error || status === 'pending' || person.id === currentUser?.id || roleDrafts[person.id] === person.role" :loading="busy === person.id" @click="requestRoleChange(person, $event)">{{ t('account.save') }}</UButton></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!data.users.length" class="admin-empty">{{ t('admin.emptyUsers') }}</p>
          <nav v-if="data.totals.users > data.pageSize" class="admin-pagination" :aria-label="t('admin.usersPages')"><UButton variant="outline" icon="i-lucide-arrow-left" data-testid="admin-users-prev" :disabled="data.usersPage <= 1 || !!busy || !!error || status === 'pending'" @click="changePage('users', data.usersPage - 1)">{{ t('admin.previous') }}</UButton><span role="status">{{ t('admin.page', { page: data.usersPage, total: Math.ceil(data.totals.users / data.pageSize) }) }}</span><UButton variant="outline" trailing-icon="i-lucide-arrow-right" data-testid="admin-users-next" :disabled="data.usersPage * data.pageSize >= data.totals.users || !!busy || !!error || status === 'pending'" @click="changePage('users', data.usersPage + 1)">{{ t('admin.next') }}</UButton></nav>
        </section>

        <section class="admin-section" aria-labelledby="admin-memorials-heading">
          <div class="admin-section-heading"><div><h2 id="admin-memorials-heading" tabindex="-1">{{ t('admin.memorials') }}<span>{{ data.totals.memorials }}</span></h2><p class="admin-section-description">{{ t(canEdit ? 'admin.memorialsManageHint' : 'admin.memorialsReadHint') }}</p></div><UButton v-if="canManage" :to="localePath('/memorials/new')" :disabled="!!error || status === 'pending'" icon="i-lucide-plus" data-testid="admin-create-memorial">{{ t('admin.addMemorial') }}</UButton></div>
          <div v-if="data.memorials.length" class="admin-memorial-grid" :aria-busy="status === 'pending'">
            <article v-for="memorial in data.memorials" :key="memorial.id" class="admin-memorial" :data-testid="`admin-memorial-row-${memorial.id}`">
              <p class="admin-subtle">{{ t(`garden.names.${memorial.gardenId}`) }} · {{ t('account.place', { place: memorial.place }) }}</p>
              <h3>{{ memorial.name }}</h3><p class="admin-subtle">{{ memorial.born }} — {{ memorial.died }}</p>
              <p class="admin-memorial-story">{{ memorial.story }}</p>
              <div class="admin-memorial-actions"><UButton :to="{ path: localePath('/gardens'), query: { garden: memorial.gardenId, memorial: memorial.id } }" variant="link" class="admin-place-link">{{ t('creation.view') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></UButton><div v-if="canEdit"><UTooltip :text="t('admin.editMemorial', { name: memorial.name })"><UButton :to="localePath(`/memorials/${memorial.id}/edit`)" :data-testid="`admin-memorial-edit-${memorial.id}`" icon="i-lucide-pencil" variant="outline" :disabled="!!error || status === 'pending'" :aria-label="t('admin.editMemorial', { name: memorial.name })" /></UTooltip><UTooltip v-if="canManage" :text="t('admin.deleteMemorial', { name: memorial.name })"><UButton :data-testid="`admin-memorial-delete-${memorial.id}`" color="error" icon="i-lucide-trash-2" variant="outline" :disabled="!ready || !!busy || !!error || status === 'pending'" :aria-label="t('admin.deleteMemorial', { name: memorial.name })" @click="requestDeletion(memorial, $event)" /></UTooltip></div></div>
            </article>
          </div>
          <p v-else class="admin-empty">{{ t('admin.emptyMemorials') }}</p>
          <nav v-if="data.totals.memorials > data.pageSize" class="admin-pagination" :aria-label="t('admin.memorialPages')"><UButton variant="outline" icon="i-lucide-arrow-left" data-testid="admin-memorials-prev" :disabled="data.memorialsPage <= 1 || !!busy || !!error || status === 'pending'" @click="changePage('memorials', data.memorialsPage - 1)">{{ t('admin.previous') }}</UButton><span role="status">{{ t('admin.page', { page: data.memorialsPage, total: Math.ceil(data.totals.memorials / data.pageSize) }) }}</span><UButton variant="outline" trailing-icon="i-lucide-arrow-right" data-testid="admin-memorials-next" :disabled="data.memorialsPage * data.pageSize >= data.totals.memorials || !!busy || !!error || status === 'pending'" @click="changePage('memorials', data.memorialsPage + 1)">{{ t('admin.next') }}</UButton></nav>
        </section>
      </template>
    </main>
    <UnsavedChangesDialog v-model:open="guard.open.value" :pending="guard.pending.value" @keep="guard.keepEditing" @discard="guard.discard" />
    <UModal v-model:open="deleteOpen" :title="t('admin.deleteTitle')" :description="t('admin.deleteDescription', { name: deleteTarget?.name ?? '' })" :dismissible="!busy" :close="!busy" :content="{ onOpenAutoFocus: focusCancel, onCloseAutoFocus: restoreDialogFocus }">
      <template #body><UAlert v-if="actionError" :title="t(actionError)" color="error" role="alert" /><p>{{ t('admin.deleteWarning') }}</p></template>
      <template #footer><div class="admin-delete-actions"><UButton variant="outline" :disabled="!!busy" data-admin-cancel @click="deleteTarget = null">{{ t('account.cancel') }}</UButton><UButton color="error" icon="i-lucide-trash-2" :loading="!!busy" :disabled="!!busy || forbidden" data-testid="admin-delete-confirm" @click="deleteMemorial">{{ t('admin.delete') }}</UButton></div></template>
    </UModal>
    <UModal v-model:open="roleOpen" :title="t('admin.roleChangeTitle')" :description="t('admin.roleChangeDescription', { name: roleTarget?.name ?? '', from: t(`admin.roles.${roleTarget?.from ?? 'user'}`), to: t(`admin.roles.${roleTarget?.to ?? 'user'}`) })" :dismissible="!busy" :close="!busy" :content="{ onOpenAutoFocus: focusCancel, onCloseAutoFocus: restoreDialogFocus }">
      <template #body>
        <UAlert v-if="actionError" :title="t(actionError)" color="error" role="alert" class="admin-dialog-error" />
        <p>{{ t('admin.roleChangeWarning') }}</p>
        <dl class="admin-proposed-permissions"><div><dt>{{ t('admin.permissions.panel') }}</dt><dd>{{ t(`admin.panelLevels.${proposedPermissions.adminPanel}`) }}</dd></div><div><dt>{{ t('admin.permissions.features') }}</dt><dd>{{ t(proposedPermissions.experimentalFeatures ? 'admin.enabled' : 'admin.disabled') }}</dd></div><div><dt>{{ t('admin.permissions.configuration') }}</dt><dd>{{ t(`admin.configurationLevels.${proposedPermissions.configuration}`) }}</dd></div></dl>
      </template>
      <template #footer><div class="admin-delete-actions"><UButton variant="outline" :disabled="!!busy" data-admin-cancel @click="roleTarget = null">{{ t('account.cancel') }}</UButton><UButton icon="i-lucide-shield-check" :loading="!!busy" :disabled="!!busy || forbidden" data-testid="admin-role-confirm" @click="saveRole">{{ t('admin.changeRole') }}</UButton></div></template>
    </UModal>
  </div>
</template>

<style scoped>
.admin-page { min-height: 100dvh; background: var(--garden-cream); color: var(--ui-text); }
.admin-container { width: min(1160px, calc(100% - 64px)); margin-inline: auto; padding-block: 28px 64px; }
.admin-tabs { display: flex; gap: 28px; margin-bottom: 36px; border-bottom: 1px solid var(--ui-border); }
.admin-tabs > * { display: inline-flex; align-items: center; min-height: 48px; padding: 8px 2px; font-size: 14px; }
.admin-tabs > [aria-current] { color: #244b3b; border-bottom: 2px solid #315d46; }
.admin-heading, .admin-section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 18px; }
.admin-heading { margin-bottom: 30px; }
.admin-heading h1 { color: var(--ui-text-highlighted); font: 400 clamp(32px, 4vw, 46px)/1.2 var(--font-display); letter-spacing: -1px; }
.admin-heading p { margin-top: 12px; line-height: 1.7; }
.admin-section-nav { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 20px; border-bottom: 1px solid var(--ui-border); }
.admin-section-nav a { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 14px; border: 1px solid var(--ui-border); border-radius: var(--control-radius); font-size: 14px; color: var(--ui-text-highlighted); background: var(--surface-panel); cursor: pointer; }
.admin-section-nav a:hover { background: var(--garden-mist); border-color: var(--ui-border-accented); }
.admin-section-nav a:active { background: var(--color-garden-100); }
.admin-section-nav .iconify { width: 18px; height: 18px; color: var(--color-garden-600); }
.admin-section-nav a > span { font-size: 12px; color: var(--ui-text-muted); font-variant-numeric: tabular-nums; }
.admin-access { padding: 22px 26px; background: var(--garden-mist); border-radius: var(--panel-radius); border: 1px solid var(--ui-border); }
.admin-access summary { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 44px; cursor: pointer; list-style: none; }
.admin-access summary::-webkit-details-marker { display: none; }
.admin-access summary:hover .admin-access-toggle { text-decoration: underline; text-underline-offset: 4px; }
.admin-access summary:active { opacity: .85; }
.admin-access-overview { display: grid; gap: 8px; }
.admin-access-role { display: flex; align-items: center; gap: 10px; font: 24px/1.3 var(--font-display); color: var(--ui-text-highlighted); }
.admin-access-role .iconify { width: 22px; height: 22px; color: var(--color-garden-600); flex-shrink: 0; }
.admin-access-hint { font-size: 13px; line-height: 1.7; }
.admin-access-toggle { display: inline-flex; align-items: center; gap: 8px; color: var(--color-garden-700); font-size: 14px; flex-shrink: 0; }
.admin-access-toggle .iconify { width: 18px; height: 18px; }
.admin-access[open] .admin-access-toggle .iconify { transform: rotate(180deg); }
.admin-access-label { font-size: 12px; font-weight: 600; color: var(--ui-text-muted); }
.admin-access dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--ui-border); }
.admin-access dt { color: var(--ui-text-muted); font-size: 12px; line-height: 1.5; }
.admin-access dd { margin-top: 8px; color: #244b3b; font-size: 14px; line-height: 1.7; }
.admin-section { margin-top: 40px; }
.admin-section h2 { display: flex; align-items: center; gap: 12px; font: 28px var(--font-display); color: var(--ui-text-highlighted); }
.admin-section h2 > span { font: 13px var(--font-sans); border-radius: 6px; padding: 4px 7px; background: #e7ebdf; }
.admin-section-description { margin-top: 10px; max-width: 640px; font-size: 14px; line-height: 1.7; }
.admin-gardens { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 20px; padding: 0; list-style: none; }
.admin-gardens a { position: relative; display: grid; gap: 8px; padding: 22px; background: var(--surface-panel); border: 1px solid var(--ui-border); border-radius: var(--panel-radius); }
.admin-gardens a:hover { border-color: #9aaa81; }
.admin-gardens a:active { background: var(--garden-mist); }
.admin-gardens a > span:first-child { color: #244b3b; }
.admin-garden-name { display: flex; align-items: center; gap: 8px; padding-right: 16px; font-size: 15px; }
.admin-garden-name .iconify { width: 18px; height: 18px; flex-shrink: 0; }
.admin-gardens strong { font: 28px var(--font-display); color: #244b3b; }
.admin-gardens strong > span { font: 15px var(--font-sans); color: var(--ui-text-muted); }
.admin-garden-arrow { position: absolute; top: 23px; right: 20px; }
.admin-gardens meter { width: 100%; height: 8px; margin-block: 4px; border: 0; border-radius: 3px; background: var(--color-garden-100); }
.admin-gardens meter::-webkit-meter-bar { height: 8px; border: 0; border-radius: 3px; background: var(--color-garden-100); }
.admin-gardens meter::-webkit-meter-optimum-value { border-radius: 3px; background: var(--color-garden-600); }
.admin-gardens meter::-moz-meter-bar { border-radius: 3px; background: var(--color-garden-600); }
.admin-table-scroll { margin-top: 20px; overflow: auto; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: var(--surface-panel); }
.admin-table { border-collapse: collapse; width: 100%; text-align: left; font-size: 14px; }
.admin-table th { padding: 15px 20px; color: var(--ui-text-muted); font-weight: 500; font-size: 12px; background: #f0f1e7; }
.admin-table td { padding: 16px 20px; border-top: 1px solid #ece8dc; vertical-align: top; }
.admin-table tbody tr:focus-within { background: #f5f5eb; }
.admin-table td:first-child { min-width: 150px; }
.admin-table strong { color: #244b3b; font-weight: 500; }
.admin-role-control { min-width: 175px; }
.admin-role-select { width: 100%; }
.admin-self-note { display: block; margin-top: 8px; max-width: 200px; }
.admin-role-label { display: inline-block; padding: 7px 10px; border-radius: 6px; color: #315d46; background: #edf1e5; white-space: nowrap; }
.admin-subtle { color: var(--ui-text-muted); font-size: 12px; line-height: 1.7; }
.admin-email-state { display: block; margin-top: 5px; }
.admin-memorial-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 20px; }
.admin-memorial { display: flex; flex-direction: column; padding: 24px; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: var(--surface-panel); }
.admin-memorial h3 { margin-top: 12px; overflow-wrap: anywhere; color: #244b3b; font: 27px/1.3 var(--font-display); }
.admin-memorial-story { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; margin-block: 18px 20px; font-size: 14px; line-height: 1.7; }
.admin-memorial-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 14px; border-top: 1px solid #ece8dc; }
.admin-memorial-actions > div { display: flex; gap: 8px; }
.admin-place-link { padding-inline: 0; }
.admin-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 20px; font-size: 13px; }
.admin-feedback-region { display: grid; align-items: center; min-height: 76px; padding-block: 12px; }
.admin-saved, .admin-status { display: flex; align-items: center; gap: 10px; color: var(--color-garden-700); font-size: 14px; line-height: 1.7; }
.admin-saved .iconify, .admin-status .iconify { width: 18px; height: 18px; flex-shrink: 0; }
.admin-unavailable { display: grid; justify-items: center; padding-block: 24px; }
.admin-proposed-permissions { display: grid; gap: 18px; margin-top: 24px; padding: 20px; background: var(--garden-mist); border-radius: var(--control-radius); }
.admin-proposed-permissions dt { color: var(--ui-text-muted); font-size: 13px; }
.admin-proposed-permissions dd { margin-top: 4px; color: var(--ui-text-highlighted); font-size: 15px; line-height: 1.7; }
.admin-dialog-error { margin-bottom: 20px; }
.admin-empty { margin-top: 20px; padding: 32px; border: 1px dashed #bfcab4; border-radius: var(--panel-radius); text-align: center; }
.admin-delete-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; width: 100%; gap: 12px; }
.admin-delete-actions :deep(button) { min-height: 44px; }
.admin-page :deep(button), .admin-page :deep(a[data-slot='base']) { min-height: 44px; }
@media (max-width: 1000px) { .admin-memorial-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) {
  .admin-container { width: calc(100% - 32px); padding-top: 16px; }
  .admin-tabs { gap: 20px; margin-bottom: 26px; }
  .admin-access { padding: 22px; }
  .admin-access summary { align-items: start; }
  .admin-access-toggle { font-size: 0; padding-top: 3px; }
  .admin-access-role { font-size: 22px; }
  .admin-access dl { grid-template-columns: 1fr; gap: 18px; }
  .admin-gardens { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .admin-gardens a { padding: 18px; }
  .admin-garden-arrow { top: 20px; right: 14px; }
  .admin-memorial-grid { grid-template-columns: 1fr; }
  .admin-pagination { justify-content: space-between; gap: 8px; }
  .admin-table-scroll { overflow: clip; }
  .admin-table, .admin-table tbody { display: block; }
  .admin-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .admin-table tbody tr { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 22px; }
  .admin-table tbody tr + tr { border-top: 1px solid #ece8dc; }
  .admin-table td, .admin-table td:first-child { display: block; min-width: 0; padding: 0; border: 0; overflow-wrap: anywhere; }
  .admin-table td[data-label]::before { display: block; margin-bottom: 7px; color: var(--ui-text-muted); font-size: 12px; content: attr(data-label); }
  .admin-role-control { display: block; }
  .admin-role-control { min-width: 0; }
  .admin-section-nav { gap: 8px; }
  .admin-section-nav a { flex: 1 1 auto; justify-content: center; padding-inline: 12px; }
}
</style>
