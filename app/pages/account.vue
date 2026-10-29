<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ middleware: 'auth', colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useAuthClient()
const { data: user, error, refresh } = await useFetch('/api/me')
const { data: memorials, error: memorialError, status: memorialStatus, refresh: refreshMemorials } = await useFetch('/api/memorials/mine', { key: 'my-memorials', default: () => [] })
const busy = ref(false)
const ready = ref(false)
const failed = ref(false)
const editing = ref(false)
const saving = ref(false)
const saveError = ref(false)
const saved = ref(false)
const formContainer = useTemplateRef('formContainer')
const state = reactive({ name: '', surname: '' })
const profileDirty = computed(() => editing.value && (state.name !== (user.value?.name ?? '') || state.surname !== (user.value?.surname ?? '')))
const profileGuard = useUnsavedChangesGuard(() => profileDirty.value, () => saving.value)
const schema = computed(() => z.object({
  name: z.string().trim().min(1, t('auth.nameRequired')).max(80, t('auth.nameLimit')),
  surname: z.string().trim().max(80, t('account.surnameLimit'))
}))
const initials = computed(() => [user.value?.name, user.value?.surname].filter(Boolean).map(part => Array.from(part!.trim())[0]).join('').toLocaleUpperCase(locale.value))
const gardenIcons = { meadow: 'i-lucide-flower-2', lake: 'i-lucide-waves', grove: 'i-lucide-trees', hill: 'i-lucide-mountain' }

onMounted(() => { ready.value = true })
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
useSeoMeta({ title: () => `${t('auth.account')} — PetMemoreal` })

function editProfile() {
  state.name = user.value?.name ?? ''
  state.surname = user.value?.surname ?? ''
  saveError.value = false
  saved.value = false
  editing.value = true
}

async function closeProfile() {
  await profileGuard.requestDiscard(() => { editing.value = false })
}

async function focusError() {
  await nextTick()
  formContainer.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function saveProfile(event: FormSubmitEvent<z.output<typeof schema.value>>) {
  if (saving.value || !user.value) return
  saving.value = true
  saveError.value = false
  try {
    const result = await auth.updateUser(event.data)
    if (result.error) throw new Error('Profile update failed')
    user.value = { ...user.value, ...event.data }
    editing.value = false
    saved.value = true
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}

async function signOut() {
  if (busy.value || saving.value) return
  busy.value = true
  failed.value = false
  try {
    const result = await auth.signOut()
    if (result.error) throw new Error('Sign out failed')
    clearNuxtData()
    await navigateTo(localePath('/'), { replace: true })
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="account-page">
    <a href="#account-main" class="skip-link">{{ t('nav.skip') }}</a>
    <header class="account-header">
      <div class="account-container account-header-inner">
        <NuxtLink :to="localePath('/')" class="brand"><span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span><span>PetMemoreal</span></NuxtLink>
        <nav :aria-label="t('account.navigation')">
          <NuxtLink :to="localePath('/gardens')" class="account-garden-link"><UIcon name="i-lucide-trees" aria-hidden="true" /><span>{{ t('garden.enter') }}</span></NuxtLink>
          <LanguageSwitch />
        </nav>
      </div>
    </header>

    <main id="account-main" class="account-container account-main" tabindex="-1">
      <div class="account-heading">
        <h1>{{ t('auth.account') }}</h1>
      </div>

      <nav v-if="(user?.permissions?.adminPanel ?? 0) > 0" class="account-tabs" :aria-label="t('admin.navigation')">
        <span aria-current="page">{{ t('account.profile') }}</span>
        <NuxtLink :to="localePath('/admin')" data-testid="admin-profile-link"><UIcon name="i-lucide-settings-2" aria-hidden="true" />{{ t('admin.title') }}</NuxtLink>
      </nav>

      <AppState v-if="error" kind="error" retry @retry="refresh()" />
      <section v-else-if="user" class="account-profile" aria-labelledby="profile-heading">
        <div class="account-profile-content">
          <div class="account-section-heading">
            <div class="account-profile-heading"><div class="account-avatar" aria-hidden="true">{{ initials }}</div><h2 id="profile-heading">{{ t('account.profile') }}</h2></div>
            <UButton icon="i-lucide-pencil" variant="ghost" :disabled="!ready || busy" @click="editProfile">{{ t('account.edit') }}</UButton>
          </div>
          <dl class="account-details">
            <div><dt>{{ t('account.name') }}</dt><dd data-testid="profile-name">{{ user.name }}</dd></div>
            <div><dt>{{ t('account.surname') }}</dt><dd data-testid="profile-surname" :class="{ 'account-unset': !user.surname }">{{ user.surname || t('account.notProvided') }}</dd></div>
            <div class="account-email"><dt>{{ t('auth.email') }}</dt><dd>{{ user.email }}<span class="account-verified"><UIcon name="i-lucide-badge-check" aria-hidden="true" />{{ t('account.verified') }}</span></dd></div>
          </dl>
          <div class="account-save-feedback" aria-live="polite"><p v-if="saved" class="account-saved"><UIcon name="i-lucide-check" aria-hidden="true" />{{ t('account.saved') }}</p></div>
        </div>
      </section>

      <section class="account-memorials" aria-labelledby="memorials-heading">
        <div class="account-section-heading account-memorials-heading">
          <div><h2 id="memorials-heading">{{ t('creation.myPlaces') }}<span v-if="!memorialError && memorialStatus !== 'pending'" class="account-count">{{ memorials.length }}</span></h2><p>{{ t('account.memorialsIntro') }}</p></div>
        </div>
        <AppState v-if="memorialStatus === 'pending'" kind="loading" />
        <AppState v-else-if="memorialError" kind="error" retry @retry="refreshMemorials()" />
        <div v-else-if="!memorials.length" class="account-empty-state">
          <span class="account-empty-icon"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span>
          <h3>{{ t('creation.emptyTitle') }}</h3>
          <p>{{ t('creation.emptyDescription') }}</p>
          <NuxtLink :to="localePath('/gardens')" class="account-text-link">{{ t('account.choosePlace') }}<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
        </div>
        <ul v-else class="account-memorial-grid" :aria-label="t('creation.myPlaces')">
          <li v-for="memorial in memorials" :key="memorial.id">
            <NuxtLink :to="{ path: localePath('/gardens'), query: { garden: memorial.gardenId, memorial: memorial.id } }" class="account-memorial-card" :data-garden="memorial.gardenId">
              <div class="account-card-location"><span><UIcon :name="gardenIcons[memorial.gardenId]" aria-hidden="true" />{{ t(`garden.names.${memorial.gardenId}`) }}</span><span>{{ t('account.place', { place: memorial.place }) }}</span></div>
              <div class="account-card-pet"><span class="account-pet-mark"><PetSpeciesIcon :species="memorial.species" /></span><h3>{{ memorial.name }}</h3></div>
              <p class="account-card-years">{{ memorial.born }} — {{ memorial.died }}</p>
              <p class="account-card-story">{{ memorial.story }}</p>
              <span class="account-card-open">{{ t('creation.view') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <footer class="account-session">
        <UButton :loading="busy" :disabled="!ready || saving" color="error" class="account-sign-out" icon="i-lucide-log-out" size="lg" @click="signOut">{{ t('auth.signOut') }}</UButton>
        <UAlert v-if="failed" :title="t('auth.errors.generic')" color="error" role="alert" class="account-logout-error" />
      </footer>
    </main>

    <UModal :open="editing" :title="t('account.editTitle')" :description="t('account.editDescription')" :dismissible="!saving" @update:open="open => { if (!open) closeProfile() }">
      <template #close="{ ui }"><UButton icon="i-lucide-x" color="neutral" variant="ghost" :class="[ui.close(), 'min-h-11 min-w-11']" :aria-label="t('account.close')" :disabled="saving" @click="closeProfile" /></template>
      <template #body>
        <div ref="formContainer">
          <UForm :schema="schema" :state="state" :validate-on="[]" :disabled="saving" :loading-auto="false" novalidate class="account-profile-form" @submit="saveProfile" @error="focusError">
            <UFormField name="name" :label="t('account.name')" required><UInput v-model="state.name" autocomplete="given-name" :maxlength="80" class="w-full" autofocus /></UFormField>
            <UFormField name="surname" :label="t('account.surname')" :help="t('account.optional')"><UInput v-model="state.surname" autocomplete="family-name" :maxlength="80" class="w-full" /></UFormField>
            <UAlert v-if="saveError" :title="t('account.saveError')" color="error" role="alert" />
            <div class="account-form-actions"><UButton type="button" variant="outline" :disabled="saving" @click="closeProfile">{{ t('account.cancel') }}</UButton><UButton type="submit" icon="i-lucide-check" :loading="saving" :disabled="saving">{{ t('account.save') }}</UButton></div>
          </UForm>
        </div>
      </template>
    </UModal>
    <UnsavedChangesDialog v-model:open="profileGuard.open.value" :pending="profileGuard.pending.value" @keep="profileGuard.keepEditing" @discard="profileGuard.discard" />
  </div>
</template>

<style scoped>
.account-page { min-height: 100dvh; background: var(--garden-cream); color: var(--ui-text); }
.account-container { width: min(1120px, calc(100% - 80px)); margin-inline: auto; }
.account-header { border-bottom: 1px solid var(--ui-border); background: var(--surface-panel); }
.account-header-inner { min-height: 90px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.account-header nav { display: flex; align-items: center; gap: 24px; }
.account-garden-link { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; font-size: 14px; }
.account-garden-link .iconify { width: 20px; height: 20px; }
.account-header .brand { min-height: 44px; }
.account-garden-link:hover { color: var(--color-garden-700); text-decoration: underline; text-underline-offset: 4px; }
.account-main { padding-block: 54px 32px; }
.account-main:focus { outline: none; }
.account-heading { margin-bottom: 34px; }
.account-heading h1 { color: var(--ui-text-highlighted); font: 400 clamp(36px, 4vw, 50px)/1.2 var(--font-display); letter-spacing: -1.5px; }
.account-tabs { display: flex; flex-wrap: wrap; gap: 12px 28px; margin-bottom: 26px; border-bottom: 1px solid #dfdacb; }
.account-tabs > * { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 8px 2px; font-size: 14px; }
.account-tabs > [aria-current] { border-bottom: 2px solid #315d46; color: #244b3b; }
.account-tabs a:hover { color: #244b3b; }
.account-profile { border: 1px solid var(--ui-border); border-radius: var(--panel-radius); padding: 28px 32px 16px; background: var(--surface-panel); }
.account-profile-heading { display: flex; align-items: center; gap: 16px; min-width: 0; }
.account-avatar { display: grid; place-items: center; flex-shrink: 0; width: 48px; height: 48px; border-radius: 50%; background: var(--ui-bg-accented); color: var(--color-garden-700); font: 23px var(--font-display); }
.account-profile-content { flex: 1; min-width: 0; }
.account-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.account-section-heading h2 { font-size: 26px; letter-spacing: -0.6px; }
.account-details { display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 24px; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--ui-border); }
.account-details > div { min-width: 0; }
.account-details dt { font-size: 14px; color: var(--ui-text-muted); margin-bottom: 8px; }
.account-details dd { color: var(--ui-text-highlighted); font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
.account-details .account-unset { color: var(--ui-text-muted); }
.account-verified { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: var(--color-garden-600); font-size: 13px; }
.account-save-feedback { min-height: 36px; padding-top: 12px; }
.account-saved { display: flex; align-items: center; gap: 6px; color: var(--color-garden-700); font-size: 14px; line-height: 24px; }
.account-memorials { padding-block: 48px 54px; }
.account-memorials-heading { margin-bottom: 26px; flex-wrap: wrap; }
.account-memorials-heading h2 { display: flex; align-items: center; gap: 12px; font-size: 30px; }
.account-count { display: grid; place-items: center; min-width: 27px; height: 27px; padding-inline: 6px; border-radius: 50%; background: #e7ebdf; font: 13px var(--font-sans); letter-spacing: 0; }
.account-memorials-heading p { margin-top: 9px; font-size: 14px; line-height: 1.7; }
.account-empty-state { display: grid; justify-items: center; text-align: center; padding: 42px 24px; border: 1px dashed var(--ui-border-accented); border-radius: var(--panel-radius); background: var(--ui-bg-muted); }
.account-empty-icon { display: grid; place-items: center; width: 54px; height: 54px; background: #e1e7d6; border-radius: 50%; color: #315d46; margin-bottom: 18px; }
.account-empty-icon .iconify { width: 27px; height: 27px; }
.account-empty-state h3 { font: 26px/1.3 var(--font-display); }
.account-empty-state p { max-width: 440px; font-size: 14px; line-height: 1.8; margin-top: 12px; }
.account-text-link { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; margin-top: 14px; color: #315d46; font-size: 14px; text-decoration: underline; text-underline-offset: 4px; }
.account-memorial-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; list-style: none; padding: 0; }
.account-memorial-card { display: flex; flex-direction: column; height: 100%; min-height: 290px; padding: 24px; border: 1px solid var(--ui-border); border-top: 3px solid #9aaa81; border-radius: var(--panel-radius); background: var(--surface-panel); text-decoration: none; }
.account-memorial-card[data-garden="lake"] { border-top-color: #88a9ac; }
.account-memorial-card[data-garden="grove"] { border-top-color: #708e70; }
.account-memorial-card[data-garden="hill"] { border-top-color: #c6aa70; }
.account-memorial-card:hover { background: #f7f8ef; border-color: #9aaa81; }
.account-card-location { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--ui-text-toned); }
.account-card-location > span:first-child { display: flex; align-items: center; gap: 7px; }
.account-card-location .iconify { width: 19px; height: 19px; }
.account-card-pet { display: flex; align-items: center; gap: 12px; margin-top: 24px; min-width: 0; }
.account-pet-mark { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: var(--control-radius); background: var(--ui-bg-muted); color: var(--color-garden-700); }
.account-pet-mark .pet-species-icon { width: 25px; height: 25px; }
.account-memorial-card h3 { font: 29px/1.2 var(--font-display); overflow-wrap: anywhere; }
.account-card-years { margin-top: 10px; font-size: 14px; color: var(--ui-text-muted); }
.account-card-story { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; margin-block: 16px 22px; font-size: 14px; line-height: 1.8; }
.account-card-open { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--ui-border); font-size: 14px; color: var(--color-garden-700); }
.account-session { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 20px; padding-block: 26px 12px; border-top: 1px solid #dfdacb; }
.account-sign-out { background: #b33434; color: #fff; }
.account-sign-out:hover { background: #982b2b; }
.account-logout-error { flex-basis: 100%; }
.account-profile-form { display: grid; gap: 22px; }
.account-form-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }
.account-section-heading > button, .account-session > button, .account-form-actions > button { min-height: 44px; }
@media (max-width: 1000px) {
  .account-details { grid-template-columns: 1fr 1fr; }
  .account-email { grid-column: 1 / -1; }
  .account-memorial-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .account-container { width: calc(100% - 36px); }
  .account-header-inner { min-height: 76px; gap: 12px; }
  .account-header .brand { font-size: 21px; gap: 7px; }
  .account-header nav { gap: 7px; }
  .account-garden-link { justify-content: center; width: 44px; }
  .account-garden-link span:not(.iconify) { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .account-main { padding-top: 30px; }
  .account-heading { margin-bottom: 24px; }
  .account-profile { padding: 20px 20px 12px; }
  .account-avatar { width: 42px; height: 42px; font-size: 21px; }
  .account-profile-heading { gap: 12px; }
  .account-section-heading { gap: 10px; }
  .account-section-heading h2 { font-size: 22px; }
  .account-profile .account-section-heading { align-items: flex-start; flex-wrap: wrap; }
  .account-profile .account-section-heading > button { margin-left: auto; }
  .account-details { gap: 22px 16px; }
  .account-memorials { padding-block: 34px; }
  .account-memorials-heading { gap: 18px; }
  .account-memorial-grid { grid-template-columns: 1fr; }
  .account-memorial-card { min-height: 270px; }
  .account-session { align-items: flex-start; }
  .account-form-actions { display: grid; grid-template-columns: 1fr; }
  .account-form-actions > :first-child { order: 2; }
}
</style>
