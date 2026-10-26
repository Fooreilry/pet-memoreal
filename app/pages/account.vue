<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ middleware: 'auth', colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
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
        <NuxtLink :to="localePath('/')" class="brand"><span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span><span>PetMemoreal<span class="brand-dot">.</span></span></NuxtLink>
        <nav :aria-label="t('account.navigation')">
          <NuxtLink :to="localePath('/gardens')" class="account-garden-link"><UIcon name="i-lucide-trees" aria-hidden="true" /><span>{{ t('garden.enter') }}</span></NuxtLink>
          <NuxtLink :to="switchLocalePath(locale === 'ru' ? 'en' : 'ru')" class="language-link" :aria-label="t('nav.language')" :lang="locale === 'ru' ? 'en' : 'ru'">{{ locale === 'ru' ? 'EN' : 'RU' }}</NuxtLink>
        </nav>
      </div>
    </header>

    <main id="account-main" class="account-container account-main">
      <div class="account-heading">
        <p class="eyebrow">PetMemoreal / {{ t('account.personalSpace') }}</p>
        <h1>{{ t('auth.account') }}</h1>
        <p>{{ t('account.intro') }}</p>
      </div>

      <AppState v-if="error" kind="error" retry @retry="refresh()" />
      <section v-else-if="user" class="account-profile" aria-labelledby="profile-heading">
        <div class="account-avatar" aria-hidden="true">{{ initials }}</div>
        <div class="account-profile-content">
          <div class="account-section-heading">
            <h2 id="profile-heading">{{ t('account.profile') }}</h2>
            <UButton icon="i-lucide-pencil" variant="ghost" :disabled="!ready || busy" @click="editProfile">{{ t('account.edit') }}</UButton>
          </div>
          <dl class="account-details">
            <div><dt>{{ t('account.name') }}</dt><dd data-testid="profile-name">{{ user.name }}</dd></div>
            <div><dt>{{ t('account.surname') }}</dt><dd data-testid="profile-surname" :class="{ 'account-unset': !user.surname }">{{ user.surname || t('account.notProvided') }}</dd></div>
            <div class="account-email"><dt>{{ t('auth.email') }}</dt><dd>{{ user.email }}<span class="account-verified"><UIcon name="i-lucide-badge-check" aria-hidden="true" />{{ t('account.verified') }}</span></dd></div>
          </dl>
          <p v-if="saved" class="account-saved" role="status"><UIcon name="i-lucide-check" aria-hidden="true" />{{ t('account.saved') }}</p>
        </div>
      </section>

      <section class="account-memorials" aria-labelledby="memorials-heading">
        <div class="account-section-heading account-memorials-heading">
          <div><h2 id="memorials-heading">{{ t('creation.myPlaces') }}<span v-if="!memorialError && memorialStatus !== 'pending'" class="account-count">{{ memorials.length }}</span></h2><p>{{ t('account.memorialsIntro') }}</p></div>
          <UButton :to="localePath('/gardens')" icon="i-lucide-plus" size="lg">{{ t('creation.title') }}</UButton>
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
              <h3>{{ memorial.name }}</h3>
              <p class="account-card-years">{{ memorial.born }} — {{ memorial.died }}</p>
              <p class="account-card-story">{{ memorial.story }}</p>
              <span class="account-card-open">{{ t('creation.view') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <footer class="account-session">
        <div><h2>{{ t('account.session') }}</h2><p>{{ t('account.signOutNote') }}</p></div>
        <UButton :loading="busy" :disabled="!ready || saving" variant="outline" color="neutral" icon="i-lucide-log-out" size="lg" @click="signOut">{{ t('auth.signOut') }}</UButton>
        <UAlert v-if="failed" :title="t('auth.errors.generic')" color="error" role="alert" class="account-logout-error" />
      </footer>
    </main>

    <UModal v-model:open="editing" :title="t('account.editTitle')" :description="t('account.editDescription')" :dismissible="!saving">
      <template #close="{ ui }"><UButton icon="i-lucide-x" color="neutral" variant="ghost" :class="[ui.close(), 'min-h-11 min-w-11']" :aria-label="t('account.close')" :disabled="saving" @click="editing = false" /></template>
      <template #body>
        <div ref="formContainer">
          <UForm :schema="schema" :state="state" :validate-on="[]" :disabled="saving" :loading-auto="false" class="account-profile-form" @submit="saveProfile" @error="focusError">
            <UFormField name="name" :label="t('account.name')" required><UInput v-model="state.name" autocomplete="given-name" :maxlength="80" class="w-full" autofocus /></UFormField>
            <UFormField name="surname" :label="t('account.surname')" :help="t('account.optional')"><UInput v-model="state.surname" autocomplete="family-name" :maxlength="80" class="w-full" /></UFormField>
            <UAlert v-if="saveError" :title="t('account.saveError')" color="error" role="alert" />
            <div class="account-form-actions"><UButton type="button" variant="ghost" :disabled="saving" @click="editing = false">{{ t('account.cancel') }}</UButton><UButton type="submit" :loading="saving">{{ t('account.save') }}</UButton></div>
          </UForm>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.account-page { min-height: 100dvh; background: #faf7ef; color: var(--ui-text); }
.account-container { width: min(1120px, calc(100% - 80px)); margin-inline: auto; }
.account-header { border-bottom: 1px solid #dfdacb; background: #fffdf7; }
.account-header-inner { min-height: 90px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.account-header nav { display: flex; align-items: center; gap: 24px; }
.account-garden-link { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; font-size: 14px; }
.account-garden-link .iconify { width: 20px; height: 20px; }
.account-main { padding-block: 54px 32px; }
.account-heading { margin-bottom: 34px; }
.account-heading h1 { margin-top: 12px; color: var(--ui-text-highlighted); font: 400 clamp(36px, 4vw, 50px)/1.2 var(--font-display); letter-spacing: -1.5px; }
.account-heading > p:last-child { margin-top: 14px; max-width: 590px; font-size: 15px; line-height: 1.8; }
.account-profile { display: flex; align-items: flex-start; gap: 28px; border: 1px solid #dfdacb; border-radius: 22px; padding: 30px; background: #fffdf7; }
.account-avatar { display: grid; place-items: center; flex-shrink: 0; width: 72px; height: 80px; border-radius: 45% 45% 12px 12px; background: #e8eddc; color: #315d46; font: 30px var(--font-display); }
.account-profile-content { flex: 1; min-width: 0; }
.account-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.account-section-heading h2 { font-size: 26px; letter-spacing: -0.6px; }
.account-details { display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 24px; margin-top: 22px; }
.account-details > div { min-width: 0; }
.account-details dt { font-size: 12px; color: var(--ui-text-muted); margin-bottom: 8px; }
.account-details dd { color: var(--ui-text-highlighted); font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
.account-details .account-unset { color: var(--ui-text-muted); }
.account-verified { display: flex; align-items: center; gap: 5px; margin-top: 6px; color: #466d54; font-size: 11px; }
.account-saved { display: flex; align-items: center; gap: 6px; color: #315d46; font-size: 13px; margin-top: 16px; }
.account-memorials { padding-block: 48px 54px; }
.account-memorials-heading { margin-bottom: 26px; flex-wrap: wrap; }
.account-memorials-heading h2 { display: flex; align-items: center; gap: 12px; font-size: 30px; }
.account-count { display: grid; place-items: center; min-width: 27px; height: 27px; padding-inline: 6px; border-radius: 50%; background: #e7ebdf; font: 13px var(--font-sans); letter-spacing: 0; }
.account-memorials-heading p { margin-top: 9px; font-size: 14px; line-height: 1.7; }
.account-empty-state { display: grid; justify-items: center; text-align: center; padding: 42px 24px; border: 1px dashed #bfcab4; border-radius: 22px; background: #f1f2e8; }
.account-empty-icon { display: grid; place-items: center; width: 54px; height: 54px; background: #e1e7d6; border-radius: 50%; color: #315d46; margin-bottom: 18px; }
.account-empty-icon .iconify { width: 27px; height: 27px; }
.account-empty-state h3 { font: 26px/1.3 var(--font-display); }
.account-empty-state p { max-width: 440px; font-size: 14px; line-height: 1.8; margin-top: 12px; }
.account-text-link { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; margin-top: 14px; color: #315d46; font-size: 14px; text-decoration: underline; text-underline-offset: 4px; }
.account-memorial-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; list-style: none; padding: 0; }
.account-memorial-card { display: flex; flex-direction: column; height: 100%; min-height: 290px; padding: 24px; border: 1px solid #dfdacb; border-top: 3px solid #9aaa81; border-radius: 18px; background: #fffdf7; text-decoration: none; }
.account-memorial-card[data-garden="lake"] { border-top-color: #88a9ac; }
.account-memorial-card[data-garden="grove"] { border-top-color: #708e70; }
.account-memorial-card[data-garden="hill"] { border-top-color: #c6aa70; }
.account-memorial-card:hover { background: #f7f8ef; border-color: #9aaa81; }
.account-card-location { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #566b57; }
.account-card-location > span:first-child { display: flex; align-items: center; gap: 7px; }
.account-card-location .iconify { width: 19px; height: 19px; }
.account-memorial-card h3 { margin-top: 24px; font: 30px/1.2 var(--font-display); overflow-wrap: anywhere; }
.account-card-years { margin-top: 8px; font-size: 12px; color: var(--ui-text-muted); }
.account-card-story { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; margin-block: 16px 22px; font-size: 14px; line-height: 1.8; }
.account-card-open { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 16px; border-top: 1px solid #e8e5d9; font-size: 13px; color: #315d46; }
.account-session { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; padding-block: 26px 12px; border-top: 1px solid #dfdacb; }
.account-session h2 { font: 22px var(--font-display); letter-spacing: -0.3px; }
.account-session p { margin-top: 7px; font-size: 13px; line-height: 1.7; }
.account-logout-error { flex-basis: 100%; }
.account-profile-form { display: grid; gap: 22px; }
.account-form-actions { display: flex; justify-content: flex-end; gap: 12px; }
.account-section-heading > button, .account-memorials-heading > a, .account-session > button, .account-form-actions > button { min-height: 44px; }
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
  .account-profile { padding: 22px; gap: 18px; flex-wrap: wrap; }
  .account-avatar { width: 50px; height: 54px; font-size: 23px; }
  .account-profile-content { flex-basis: 100%; }
  .account-section-heading { gap: 10px; }
  .account-section-heading h2 { font-size: 24px; }
  .account-details { gap: 22px 16px; }
  .account-memorials { padding-block: 34px; }
  .account-memorials-heading { gap: 18px; }
  .account-memorial-grid { grid-template-columns: 1fr; }
  .account-memorial-card { min-height: 270px; }
  .account-session { align-items: flex-start; }
}
</style>
