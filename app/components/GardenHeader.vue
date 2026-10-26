<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const route = useRoute()
const request = useRequestFetch()
const auth = useAuthClient()
const toast = useToast()
const { data: signedIn } = await useAsyncData('garden-header-auth', async () => {
  try {
    // The protected endpoint validates the session directly, including email verification.
    // SSR reads must not share the public auth endpoint's rate-limit bucket.
    await request('/api/me')
    return true
  } catch {
    return false
  }
})
const open = ref(false)
const busy = ref(false)
const ready = ref(false)
const accountMenu = ref<HTMLElement>()
const accountTrigger = ref<HTMLButtonElement>()
const menuId = useId()
let closeTimer: ReturnType<typeof setTimeout> | undefined
let pointerOpened = false

function keepOpen() {
  clearTimeout(closeTimer)
}

function pointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !ready.value || busy.value) return
  keepOpen()
  if (!open.value) pointerOpened = true
  open.value = true
}

function pointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !pointerOpened) return
  keepOpen()
  closeTimer = setTimeout(() => { open.value = false }, 250)
}

function directInteraction() {
  keepOpen()
  pointerOpened = false
}

function menuItems() {
  return Array.from(accountMenu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])
}

async function toggleMenu(event: MouseEvent) {
  directInteraction()
  // A mouse click keeps the already-hovered menu open; a second tap can close it.
  open.value = event.detail > 0 && window.matchMedia('(hover: hover)').matches ? true : !open.value
  if (open.value && event.detail === 0) {
    await nextTick()
    menuItems()[0]?.focus()
  }
}

async function menuKeydown(event: KeyboardEvent) {
  directInteraction()
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    open.value = false
    accountTrigger.value?.focus()
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    open.value = true
    await nextTick()
    const items = menuItems()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length)
    items[index]?.focus()
  } else if (event.key === 'Tab') open.value = false
}

function focusLeft(event: FocusEvent) {
  if (!accountMenu.value?.contains(event.relatedTarget as Node | null)) open.value = false
}

function outsidePointer(event: PointerEvent) {
  if (!accountMenu.value?.contains(event.target as Node)) open.value = false
}

async function signOut() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await auth.signOut()
    if (result.error) throw new Error('Sign out failed')
    clearNuxtData()
    signedIn.value = false
    open.value = false
    await navigateTo(localePath('/'), { replace: true })
  } catch {
    toast.add({ title: t('auth.errors.generic'), color: 'error' })
  } finally {
    busy.value = false
  }
}

watch(() => route.fullPath, () => { keepOpen(); open.value = false })
watch(open, value => { if (!value) keepOpen() })
onMounted(() => {
  ready.value = true
  document.addEventListener('pointerdown', outsidePointer)
})
onBeforeUnmount(() => {
  keepOpen()
  document.removeEventListener('pointerdown', outsidePointer)
})
</script>

<template>
  <header class="garden-site-header" data-testid="garden-header">
    <NuxtLink :to="localePath('/')" class="brand" aria-label="PetMemoreal" data-testid="garden-home"><span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span><span>PetMemoreal<span class="brand-dot">.</span></span></NuxtLink>
    <div class="garden-header-actions">
      <NuxtLink :to="switchLocalePath(locale === 'ru' ? 'en' : 'ru')" class="language-link" :aria-label="t('nav.language')" :lang="locale === 'ru' ? 'en' : 'ru'">{{ locale === 'ru' ? 'EN' : 'RU' }}</NuxtLink>
      <div ref="accountMenu" class="garden-account-menu" @pointerenter="pointerEnter" @pointerleave="pointerLeave" @keydown="menuKeydown" @pointerdown.capture="directInteraction" @focusout="focusLeft">
        <button :id="`${menuId}-trigger`" ref="accountTrigger" type="button" class="garden-account-trigger" :aria-label="t('account.menu')" aria-haspopup="menu" :aria-expanded="open" :aria-controls="open ? menuId : undefined" :disabled="!ready || busy" :aria-busy="busy" :data-authenticated="!!signedIn" data-testid="garden-account-menu" @click="toggleMenu"><UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-user-round'" :class="{ 'animate-spin': busy }" aria-hidden="true" /></button>
        <div v-if="open" :id="menuId" role="menu" :aria-labelledby="`${menuId}-trigger`" class="garden-account-dropdown">
          <template v-if="signedIn">
            <NuxtLink :to="localePath('/account')" role="menuitem" tabindex="-1" @click="open = false"><UIcon name="i-lucide-user-round" aria-hidden="true" />{{ t('account.openProfile') }}</NuxtLink>
            <button type="button" role="menuitem" tabindex="-1" :disabled="busy" @click="signOut"><UIcon name="i-lucide-log-out" aria-hidden="true" />{{ t('auth.signOut') }}</button>
          </template>
          <template v-else>
            <NuxtLink :to="localePath('/login')" role="menuitem" tabindex="-1" @click="open = false"><UIcon name="i-lucide-log-in" aria-hidden="true" />{{ t('auth.actions.login') }}</NuxtLink>
            <NuxtLink :to="localePath('/register')" role="menuitem" tabindex="-1" @click="open = false"><UIcon name="i-lucide-user-plus" aria-hidden="true" />{{ t('auth.createAccount') }}</NuxtLink>
          </template>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.garden-site-header { position: relative; z-index: 10; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 80px; padding: calc(12px + env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 12px max(24px, env(safe-area-inset-left)); }
.garden-header-actions { display: flex; align-items: center; gap: 12px; }
.garden-account-menu { position: relative; }
.garden-account-trigger { display: grid; place-items: center; width: 46px; height: 46px; padding: 0; border: 1px solid #ccd2bf; border-radius: 50%; color: #244b3b; background: #e9eddf; cursor: pointer; }
.garden-account-trigger:hover, .garden-account-trigger[aria-expanded='true'] { background: #dce5cf; }
.garden-account-trigger:focus-visible { outline: 2px solid #ac7324; outline-offset: 3px; }
.garden-account-trigger > .iconify { width: 22px; height: 22px; }
.garden-account-dropdown { position: absolute; z-index: 20; top: calc(100% + 8px); right: 0; width: min(208px, calc(100vw - 28px)); padding: 8px; border: 1px solid #d8d5c3; border-radius: 16px; color: #244b3b; background: #fffcf5; box-shadow: 0 12px 36px #102f2c24; }
.garden-account-dropdown > a, .garden-account-dropdown > button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 10px; text-align: left; font-size: 14px; cursor: pointer; }
.garden-account-dropdown > a:hover, .garden-account-dropdown > button:hover, .garden-account-dropdown > a:focus, .garden-account-dropdown > button:focus { outline: none; background: #e9eddf; }
.garden-account-dropdown .iconify { width: 19px; height: 19px; color: #527355; flex-shrink: 0; }
@media (max-width: 600px) {
  .garden-site-header { min-height: 68px; padding: calc(10px + env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 10px max(14px, env(safe-area-inset-left)); }
  .brand { gap: 8px; font-size: 22px; }
  .brand-mark { width: 30px; height: 35px; }
  .garden-header-actions { gap: 4px; }
  .garden-account-trigger { width: 44px; height: 44px; }
}
</style>
