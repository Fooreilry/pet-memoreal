<script setup lang="ts">
import { userRoles } from '#shared/roles'
import type { UserRole } from '#shared/roles'
import type { AdminOverview } from '#shared/admin'

definePageMeta({ middleware: ['auth', 'admin'], colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const request = useRequestFetch()
const ready = ref(false)
const busy = ref('')
const actionError = ref('')
const saved = ref(false)
const denied = ref(false)
const deleteTarget = ref<{ id: string, name: string } | null>(null)
const roleDrafts = reactive<Record<string, UserRole>>({})
const usersPage = computed(() => pageNumber(route.query.usersPage))
const memorialsPage = computed(() => pageNumber(route.query.memorialsPage))
const { data: currentUser } = await useFetch('/api/me')
const { data, error, status, refresh } = await useAsyncData('admin-overview', () => request<AdminOverview>('/api/admin/overview', {
  query: { usersPage: usersPage.value, memorialsPage: memorialsPage.value }, retry: 0
}), { watch: [usersPage, memorialsPage] })
const canEdit = computed(() => (data.value?.permissions.adminPanel ?? 0) >= 2)
const canManage = computed(() => (data.value?.permissions.adminPanel ?? 0) >= 3)
const forbidden = computed(() => denied.value || error.value?.statusCode === 403)
const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (open: boolean) => { if (!open && !busy.value) deleteTarget.value = null } })

watch(data, (value) => {
  for (const user of value?.users ?? []) roleDrafts[user.id] = user.role
}, { immediate: true })
onMounted(() => { ready.value = true })
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
useSeoMeta({ title: () => `${t('admin.title')} — PetMemoreal` })

function pageNumber(value: unknown) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1
}

function changePage(kind: 'users' | 'memorials', page: number) {
  return navigateTo({ path: localePath('/admin'), query: { ...route.query, [`${kind}Page`]: page === 1 ? undefined : String(page) } })
}

function actionFailed(error: unknown) {
  const code = (error as { statusCode?: number }).statusCode
  if (code === 403 || code === 401) denied.value = true
  actionError.value = code === 409 ? 'admin.conflict' : 'admin.actionError'
}

async function saveRole(id: string) {
  const role = roleDrafts[id]
  if (busy.value || !canManage.value || !role || id === currentUser.value?.id) return
  busy.value = id
  actionError.value = ''
  saved.value = false
  try {
    await $fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { role } })
    await refresh()
    saved.value = true
  } catch (error) {
    actionFailed(error)
  } finally { busy.value = '' }
}

async function deleteMemorial() {
  const memorial = deleteTarget.value
  if (busy.value || !canManage.value || !memorial) return
  busy.value = memorial.id
  actionError.value = ''
  saved.value = false
  try {
    await $fetch(`/api/admin/memorials/${encodeURIComponent(memorial.id)}`, { method: 'DELETE' })
    clearNuxtData(['map-memorials', 'my-memorials'])
    deleteTarget.value = null
    await refresh()
    saved.value = true
  } catch (error) {
    actionFailed(error)
  } finally { busy.value = '' }
}
</script>

<template>
  <div class="admin-page" data-testid="admin-page">
    <a href="#admin-main" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader />
    <main id="admin-main" class="admin-container">
      <nav class="admin-tabs" :aria-label="t('admin.navigation')">
        <NuxtLink :to="localePath('/account')">{{ t('account.profile') }}</NuxtLink>
        <span aria-current="page">{{ t('admin.title') }}</span>
      </nav>
      <div class="admin-heading">
        <div><h1>{{ t('admin.title') }}</h1><p>{{ t('admin.intro') }}</p></div>
        <UButton v-if="data && !forbidden" icon="i-lucide-refresh-cw" variant="outline" :disabled="!ready || !!busy || status === 'pending'" @click="refresh()">{{ t('admin.refresh') }}</UButton>
      </div>
      <AppState v-if="forbidden" kind="error" :title="t('admin.deniedTitle')" :description="t('admin.deniedDescription')" />
      <AppState v-else-if="error" kind="error" retry @retry="refresh()" />
      <AppState v-else-if="status === 'pending'" kind="loading" />
      <template v-else-if="data">
        <UAlert v-if="actionError" color="error" :title="t(actionError)" role="alert" class="admin-feedback" />
        <p v-if="saved" class="admin-saved" role="status"><UIcon name="i-lucide-check" aria-hidden="true" />{{ t('admin.saved') }}</p>

        <section class="admin-access" aria-labelledby="access-heading">
          <div><h2 id="access-heading">{{ t('admin.access') }}</h2><p>{{ t(`admin.roles.${currentUser?.role ?? 'user'}`) }}</p></div>
          <dl>
            <div><dt>{{ t('admin.permissions.panel') }}</dt><dd>{{ t(`admin.panelLevels.${data.permissions.adminPanel}`) }}</dd></div>
            <div><dt>{{ t('admin.permissions.features') }}</dt><dd>{{ t(data.permissions.experimentalFeatures ? 'admin.enabled' : 'admin.disabled') }}</dd></div>
            <div><dt>{{ t('admin.permissions.configuration') }}</dt><dd>{{ t(`admin.configurationLevels.${data.permissions.configuration}`) }}</dd></div>
          </dl>
        </section>

        <section class="admin-section" aria-labelledby="gardens-heading">
          <h2 id="gardens-heading">{{ t('admin.gardens') }}</h2>
          <ul class="admin-gardens">
            <li v-for="garden in data.gardens" :key="garden.id"><NuxtLink :to="{ path: localePath('/gardens'), query: { garden: garden.id } }"><span>{{ t(`garden.names.${garden.id}`) }}</span><strong>{{ garden.occupied }} / {{ garden.capacity }}</strong><span class="admin-subtle">{{ t('admin.occupied') }}</span><UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink></li>
          </ul>
        </section>

        <section class="admin-section" aria-labelledby="users-heading">
          <div class="admin-section-heading"><h2 id="users-heading">{{ t('admin.users') }}<span>{{ data.totals.users }}</span></h2></div>
          <div class="admin-table-scroll" tabindex="0" role="region" :aria-label="t('admin.users')">
            <table class="admin-table" role="table">
              <thead><tr><th scope="col">{{ t('admin.person') }}</th><th scope="col">{{ t('auth.email') }}</th><th scope="col">{{ t('admin.role') }}</th><th v-if="canManage" scope="col"><span class="sr-only">{{ t('admin.actions') }}</span></th></tr></thead>
              <tbody>
                <tr v-for="person in data.users" :key="person.id" :data-testid="`admin-users-row-${person.id}`">
                  <td><strong>{{ [person.name, person.surname].filter(Boolean).join(' ') }}</strong></td>
                  <td :data-label="t('auth.email')"><span>{{ person.email }}</span><span class="admin-subtle admin-email-state">{{ t(person.emailVerified ? 'account.verified' : 'admin.unverified') }}</span></td>
                  <td :data-label="t('admin.role')">
                    <label v-if="canManage" class="admin-role-control"><span class="sr-only">{{ t('admin.roleFor', { name: person.name }) }}</span><select v-model="roleDrafts[person.id]" :data-testid="`admin-role-${person.id}`" :disabled="!ready || !!busy || person.id === currentUser?.id"><option v-for="role in userRoles" :key="role" :value="role">{{ t(`admin.roles.${role}`) }}</option></select></label>
                    <span v-else class="admin-role-label">{{ t(`admin.roles.${person.role}`) }}</span>
                  </td>
                  <td v-if="canManage"><UButton :data-testid="`admin-role-save-${person.id}`" variant="outline" :disabled="!ready || !!busy || person.id === currentUser?.id || roleDrafts[person.id] === person.role" :loading="busy === person.id" @click="saveRole(person.id)">{{ t('account.save') }}</UButton></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!data.users.length" class="admin-empty">{{ t('admin.emptyUsers') }}</p>
          <nav v-if="data.totals.users > data.pageSize" class="admin-pagination" :aria-label="t('admin.usersPages')"><UButton variant="outline" icon="i-lucide-arrow-left" data-testid="admin-users-prev" :disabled="usersPage <= 1 || !!busy" @click="changePage('users', usersPage - 1)">{{ t('admin.previous') }}</UButton><span>{{ t('admin.page', { page: usersPage, total: Math.ceil(data.totals.users / data.pageSize) }) }}</span><UButton variant="outline" trailing-icon="i-lucide-arrow-right" data-testid="admin-users-next" :disabled="usersPage * data.pageSize >= data.totals.users || !!busy" @click="changePage('users', usersPage + 1)">{{ t('admin.next') }}</UButton></nav>
        </section>

        <section class="admin-section" aria-labelledby="admin-memorials-heading">
          <div class="admin-section-heading"><h2 id="admin-memorials-heading">{{ t('admin.memorials') }}<span>{{ data.totals.memorials }}</span></h2><UButton v-if="canManage" :to="localePath('/memorials/new')" icon="i-lucide-plus" data-testid="admin-create-memorial">{{ t('admin.addMemorial') }}</UButton></div>
          <div v-if="data.memorials.length" class="admin-memorial-grid">
            <article v-for="memorial in data.memorials" :key="memorial.id" class="admin-memorial" :data-testid="`admin-memorial-row-${memorial.id}`">
              <p class="admin-subtle">{{ t(`garden.names.${memorial.gardenId}`) }} · {{ t('account.place', { place: memorial.place }) }}</p>
              <h3>{{ memorial.name }}</h3><p class="admin-subtle">{{ memorial.born }} — {{ memorial.died }}</p>
              <p class="admin-memorial-story">{{ memorial.story }}</p>
              <div class="admin-memorial-actions"><UButton :to="{ path: localePath('/gardens'), query: { garden: memorial.gardenId, memorial: memorial.id } }" variant="link" class="admin-place-link">{{ t('creation.view') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></UButton><div v-if="canEdit"><UButton :to="localePath(`/memorials/${memorial.id}/edit`)" :data-testid="`admin-memorial-edit-${memorial.id}`" icon="i-lucide-pencil" variant="outline" :aria-label="t('admin.editMemorial', { name: memorial.name })" /><UButton v-if="canManage" :data-testid="`admin-memorial-delete-${memorial.id}`" color="error" icon="i-lucide-trash-2" variant="outline" :disabled="!ready || !!busy" :aria-label="t('admin.deleteMemorial', { name: memorial.name })" @click="deleteTarget = { id: memorial.id, name: memorial.name }" /></div></div>
            </article>
          </div>
          <p v-else class="admin-empty">{{ t('admin.emptyMemorials') }}</p>
          <nav v-if="data.totals.memorials > data.pageSize" class="admin-pagination" :aria-label="t('admin.memorialPages')"><UButton variant="outline" icon="i-lucide-arrow-left" data-testid="admin-memorials-prev" :disabled="memorialsPage <= 1 || !!busy" @click="changePage('memorials', memorialsPage - 1)">{{ t('admin.previous') }}</UButton><span>{{ t('admin.page', { page: memorialsPage, total: Math.ceil(data.totals.memorials / data.pageSize) }) }}</span><UButton variant="outline" trailing-icon="i-lucide-arrow-right" data-testid="admin-memorials-next" :disabled="memorialsPage * data.pageSize >= data.totals.memorials || !!busy" @click="changePage('memorials', memorialsPage + 1)">{{ t('admin.next') }}</UButton></nav>
        </section>
      </template>
    </main>
    <UModal v-model:open="deleteOpen" :title="t('admin.deleteTitle')" :description="t('admin.deleteDescription', { name: deleteTarget?.name ?? '' })" :dismissible="!busy">
      <template #body><UAlert v-if="actionError" :title="t(actionError)" color="error" role="alert" /><p>{{ t('admin.deleteWarning') }}</p></template>
      <template #footer><div class="admin-delete-actions"><UButton variant="outline" :disabled="!!busy" @click="deleteTarget = null">{{ t('account.cancel') }}</UButton><UButton color="error" :loading="!!busy" :disabled="!!busy || forbidden" data-testid="admin-delete-confirm" @click="deleteMemorial">{{ t('admin.delete') }}</UButton></div></template>
    </UModal>
  </div>
</template>

<style scoped>
.admin-page { min-height: 100dvh; background: #faf7ef; color: var(--ui-text); }
.admin-container { width: min(1200px, calc(100% - 64px)); margin-inline: auto; padding-block: 28px 64px; }
.admin-tabs { display: flex; gap: 28px; margin-bottom: 36px; border-bottom: 1px solid var(--ui-border); }
.admin-tabs > * { display: inline-flex; align-items: center; min-height: 48px; padding: 8px 2px; font-size: 14px; }
.admin-tabs > [aria-current] { color: #244b3b; border-bottom: 2px solid #315d46; }
.admin-heading, .admin-section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 18px; }
.admin-heading { margin-bottom: 30px; }
.admin-heading h1 { color: var(--ui-text-highlighted); font: 400 clamp(32px, 4vw, 46px)/1.2 var(--font-display); letter-spacing: -1px; }
.admin-heading p { margin-top: 12px; line-height: 1.7; }
.admin-access { display: flex; gap: 32px; padding: 26px; background: #edf1e5; border-radius: var(--panel-radius); border: 1px solid #dce2ce; }
.admin-access h2 { font: 24px var(--font-display); color: #244b3b; }
.admin-access > div > p { margin-top: 8px; font-size: 13px; }
.admin-access dl { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.admin-access dt { color: var(--ui-text-muted); font-size: 12px; line-height: 1.5; }
.admin-access dd { margin-top: 8px; color: #244b3b; font-size: 14px; line-height: 1.7; }
.admin-section { margin-top: 40px; }
.admin-section h2 { display: flex; align-items: center; gap: 12px; font: 28px var(--font-display); color: var(--ui-text-highlighted); }
.admin-section h2 > span { font: 13px var(--font-sans); border-radius: 6px; padding: 4px 7px; background: #e7ebdf; }
.admin-gardens { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 20px; padding: 0; list-style: none; }
.admin-gardens a { position: relative; display: grid; gap: 8px; padding: 22px; background: #fffdf7; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); }
.admin-gardens a:hover { border-color: #9aaa81; }
.admin-gardens a > span:first-child { color: #244b3b; }
.admin-gardens strong { font: 28px var(--font-display); color: #244b3b; }
.admin-gardens .iconify { position: absolute; top: 23px; right: 20px; }
.admin-table-scroll { margin-top: 20px; overflow: auto; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: #fffdf7; }
.admin-table { border-collapse: collapse; width: 100%; text-align: left; font-size: 14px; }
.admin-table th { padding: 15px 20px; color: var(--ui-text-muted); font-weight: 500; font-size: 12px; background: #f0f1e7; }
.admin-table td { padding: 16px 20px; border-top: 1px solid #ece8dc; }
.admin-table td:first-child { min-width: 150px; }
.admin-table strong { color: #244b3b; font-weight: 500; }
.admin-role-control select { width: 100%; min-width: 132px; min-height: 44px; padding: 9px 12px; background: #fffdf7; color: #244b3b; border: 1px solid #b9c6ae; border-radius: var(--control-radius); }
.admin-role-control select:disabled { opacity: .6; cursor: not-allowed; }
.admin-role-label { display: inline-block; padding: 7px 10px; border-radius: 6px; color: #315d46; background: #edf1e5; white-space: nowrap; }
.admin-subtle { color: var(--ui-text-muted); font-size: 12px; line-height: 1.7; }
.admin-email-state { display: block; margin-top: 5px; }
.admin-memorial-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 20px; }
.admin-memorial { display: flex; flex-direction: column; padding: 24px; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: #fffdf7; }
.admin-memorial h3 { margin-top: 12px; overflow-wrap: anywhere; color: #244b3b; font: 27px/1.3 var(--font-display); }
.admin-memorial-story { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; margin-block: 18px 20px; font-size: 14px; line-height: 1.7; }
.admin-memorial-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 14px; border-top: 1px solid #ece8dc; }
.admin-memorial-actions > div { display: flex; gap: 8px; }
.admin-place-link { padding-inline: 0; }
.admin-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 20px; font-size: 13px; }
.admin-feedback { margin-bottom: 22px; }
.admin-saved { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; color: #315d46; font-size: 14px; }
.admin-empty { margin-top: 20px; padding: 32px; border: 1px dashed #bfcab4; border-radius: var(--panel-radius); text-align: center; }
.admin-delete-actions { display: flex; justify-content: flex-end; width: 100%; gap: 12px; }
.admin-page :deep(button), .admin-page :deep(a[data-slot='base']) { min-height: 44px; }
@media (max-width: 1000px) { .admin-access { flex-direction: column; gap: 20px; } .admin-memorial-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) {
  .admin-container { width: calc(100% - 32px); padding-top: 16px; }
  .admin-tabs { gap: 20px; margin-bottom: 26px; }
  .admin-access { padding: 22px; }
  .admin-access dl { grid-template-columns: 1fr; gap: 18px; }
  .admin-gardens { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .admin-gardens a { padding: 18px; }
  .admin-gardens .iconify { top: 20px; right: 14px; }
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
  .admin-role-control select { min-width: 0; font-size: 16px; }
}
</style>
