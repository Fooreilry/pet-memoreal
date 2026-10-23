<script setup lang="ts">
import '~/assets/css/landing.css'
import { demoGardens } from '../data/demoGardens'

definePageMeta({ colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const auth = useAuthClient()
const request = useRequestFetch()
const toast = useToast()
const { data: signedIn } = await useAsyncData('landing-auth', async () => {
  const session = await request<{ user: { id: string } } | null>('/api/auth/get-session')
  return !!session?.user
})
const signingOut = ref(false)
const ready = ref(false)
const stepIcons = ['i-lucide-map-pin', 'i-lucide-book-heart', 'i-lucide-sprout']
const valueIcons = ['i-lucide-heart', 'i-lucide-leaf', 'i-lucide-link']
const promiseIcons = ['i-lucide-heart', 'i-lucide-leaf', 'i-lucide-paw-print']
const gardenIcons = ['i-lucide-flower-2', 'i-lucide-waves', 'i-lucide-trees', 'i-lucide-mountain']
const root = useTemplateRef('root')
const motionPaused = ref(false)
let observer: IntersectionObserver | undefined

async function signOut() {
  if (signingOut.value || !ready.value) return
  signingOut.value = true
  try {
    const result = await auth.signOut()
    if (result.error) throw new Error('Sign out failed')
    clearNuxtData()
    signedIn.value = false
  } catch {
    toast.add({ title: t('auth.errors.generic'), color: 'error' })
  } finally {
    signingOut.value = false
  }
}

onMounted(() => {
  ready.value = true
  if (!('IntersectionObserver' in window)) return
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-revealed')
      observer?.unobserve(entry.target)
    }
  }, { threshold: 0.12 })
  root.value?.querySelectorAll('[data-reveal]').forEach(element => observer?.observe(element))
})
onBeforeUnmount(() => observer?.disconnect())
useHead({ htmlAttrs: { lang: () => locale.value } })
useSeoMeta({ title: () => t('meta.title'), description: () => t('meta.description'), ogTitle: () => t('meta.title'), ogDescription: () => t('meta.description') })
</script>

<template>
  <div id="top" ref="root" class="landing" :class="{ 'motion-paused': motionPaused }">
    <a href="#main" class="skip-link">{{ t('nav.skip') }}</a>
    <div class="landing-header">
      <header class="site-header shell">
      <NuxtLink :to="localePath('/')" class="brand" aria-label="PetMemoreal">
        <span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span>
        <span>PetMemoreal<span class="brand-dot">.</span></span>
      </NuxtLink>
      <nav class="desktop-nav" :aria-label="t('nav.about')">
        <a href="#about">{{ t('nav.about') }}</a>
        <a href="#gardens">{{ t('hero.secondary') }}</a>
        <a href="#how">{{ t('nav.how') }}</a>
        <a href="#questions">{{ t('nav.questions') }}</a>
      </nav>
      <div class="header-actions">
        <NuxtLink :to="switchLocalePath(locale === 'ru' ? 'en' : 'ru')" class="language-link" :aria-label="t('nav.language')" :lang="locale === 'ru' ? 'en' : 'ru'">{{ locale === 'ru' ? 'EN' : 'RU' }}</NuxtLink>
        <UTooltip v-if="signedIn" :text="t('auth.signOut')" :delay-duration="120" :ui="{ content: 'bg-[#fffcf5] text-[#244b3b] ring-1 ring-[#dcd9c7]' }">
          <UButton class="header-user" icon="i-lucide-user-round" variant="ghost" :aria-label="t('auth.signOut')" :loading="signingOut" :disabled="!ready || signingOut" data-testid="landing-sign-out" @click="signOut" />
        </UTooltip>
        <template v-else>
          <NuxtLink :to="localePath('/login')" class="auth-header-login">{{ t('auth.actions.login') }}</NuxtLink>
          <UButton :to="localePath('/register')" variant="outline" class="header-cta" trailing-icon="i-lucide-arrow-up-right">{{ t('auth.createAccount') }}</UButton>
        </template>
      </div>
      </header>
    </div>

    <main id="main">
      <section class="hero-section" aria-labelledby="hero-title">
        <img class="hero-background" src="/images/34a7d373-ee89-4a01-a2e3-7fc7b31039c3.jpg" alt="" width="1024" height="572" fetchpriority="high">
        <div class="fireflies" aria-hidden="true"><span v-for="index in 12" :key="index" :style="{ '--i': index }" /></div>
        <div class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow"><span class="small-line" />{{ t('hero.label') }}</p>
          <h1 id="hero-title">{{ t('hero.title') }}<br><em>{{ t('hero.accent') }}</em></h1>
          <p class="hero-description">{{ t('landing.intro') }}</p>
          <div class="hero-actions">
            <UButton :to="localePath('/gardens')" color="secondary" size="xl" trailing-icon="i-lucide-arrow-up-right">{{ t('hero.primary') }}</UButton>
            <a href="#gardens" class="text-link">{{ t('hero.secondary') }}<UIcon name="i-lucide-arrow-down" aria-hidden="true" /></a>
          </div>
          <p class="launch-note"><UIcon name="i-lucide-sprout" aria-hidden="true" />{{ t('landing.heroNote') }}</p>
        </div>
        </div>
        <div class="hero-bottom shell">
          <a href="#about" class="hero-scroll"><UIcon name="i-lucide-arrow-down" aria-hidden="true" />{{ t('landing.scroll') }}</a>
          <p class="hero-caption">{{ t('hero.artCaption') }}</p>
          <button class="motion-toggle" type="button" :aria-pressed="motionPaused" :aria-label="t('landing.pauseMotion')" @click="motionPaused = !motionPaused">
            <UIcon :name="motionPaused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true" />
            {{ t(motionPaused ? 'landing.motionOff' : 'landing.motionOn') }}
          </button>
        </div>
      </section>

      <div class="promise-strip">
        <div class="shell"><span v-for="(icon, index) in promiseIcons" :key="icon"><UIcon :name="icon" aria-hidden="true" />{{ t(`landing.promises.${index}`) }}</span></div>
      </div>

      <section id="about" class="about-section shell" aria-labelledby="about-title" data-reveal>
        <div><p class="eyebrow">{{ t('about.label') }}</p><h2 id="about-title">{{ t('about.title') }}</h2></div>
        <div class="about-copy"><p>{{ t('about.description') }}</p><span>{{ t('about.detail') }}</span></div>
      </section>

      <section id="gardens" class="discover-section shell" aria-labelledby="discover-title" data-reveal>
        <div class="discover-heading">
          <div class="section-heading"><p class="eyebrow">{{ t('landing.discoverLabel') }}</p><h2 id="discover-title">{{ t('landing.discoverTitle') }}</h2></div>
          <p>{{ t('landing.discoverDescription') }}</p>
        </div>
        <div class="garden-doors">
          <NuxtLink v-for="(garden, index) in demoGardens" :key="garden.id" :to="{ path: localePath('/gardens'), query: { garden: garden.id } }" class="garden-door" :class="`door-theme-${garden.id}`" :data-testid="`discover-${garden.id}`">
            <div class="door-landscape" aria-hidden="true">
              <span class="door-orbit" /><span class="door-sun" /><span class="door-hill door-hill-back" /><span class="door-hill door-hill-front" />
              <UIcon :name="gardenIcons[index]!" /><span class="door-number">0{{ index + 1 }}</span>
            </div>
            <div class="door-caption"><div><h3>{{ t(`garden.names.${garden.id}`) }}</h3><p>{{ t(`landing.gardens.${garden.id}`) }}</p></div><UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></div>
          </NuxtLink>
        </div>
      </section>

      <div class="how-band">
        <section id="how" class="how-section shell" aria-labelledby="how-title" data-reveal>
          <div class="section-heading"><p class="eyebrow">{{ t('how.label') }}</p><h2 id="how-title">{{ t('how.title') }}</h2></div>
          <div class="steps-grid">
            <article v-for="(icon, index) in stepIcons" :key="icon" class="step-card">
              <div class="step-top"><UIcon :name="icon" aria-hidden="true" /><span>0{{ index + 1 }}</span></div>
              <h3>{{ t(`how.items.${index}.title`) }}</h3><p>{{ t(`how.items.${index}.description`) }}</p>
            </article>
          </div>
        </section>
      </div>

      <section class="values-section" aria-labelledby="values-title">
        <div class="shell" data-reveal><div class="section-heading"><p class="eyebrow">{{ t('values.label') }}</p><h2 id="values-title">{{ t('values.title') }}</h2></div>
          <div class="values-grid"><article v-for="(icon, index) in valueIcons" :key="icon"><UIcon :name="icon" aria-hidden="true" /><h3>{{ t(`values.items.${index}.title`) }}</h3><p>{{ t(`values.items.${index}.description`) }}</p></article></div>
        </div>
      </section>

      <section id="questions" class="faq-section shell" aria-labelledby="faq-title" data-reveal>
        <div class="section-heading"><p class="eyebrow">{{ t('faq.label') }}</p><h2 id="faq-title">{{ t('faq.title') }}</h2></div>
        <div class="faq-list"><details v-for="index in 4" :key="index"><summary>{{ t(`faq.items.${index - 1}.question`) }}<UIcon name="i-lucide-plus" aria-hidden="true" /></summary><p>{{ t(`faq.items.${index - 1}.answer`) }}</p></details></div>
      </section>
      <section class="invitation shell" aria-labelledby="invitation-title" data-reveal>
        <UIcon name="i-lucide-sprout" class="invitation-sprout" aria-hidden="true" />
        <p class="eyebrow">{{ t('landing.invitationLabel') }}</p>
        <h2 id="invitation-title">{{ t('landing.invitationTitle') }}</h2>
        <p>{{ t('landing.invitationDescription') }}</p>
        <div class="invitation-actions">
          <UButton :to="localePath('/gardens')" color="primary" trailing-icon="i-lucide-arrow-up-right">{{ t('hero.primary') }}</UButton>
          <NuxtLink :to="localePath(signedIn ? '/account' : '/register')" class="text-link">{{ t(signedIn ? 'auth.account' : 'auth.createAccount') }}<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
        </div>
        <span class="invitation-note">{{ t('landing.invitationNote') }}</span>
      </section>
    </main>

    <footer class="site-footer shell"><div><NuxtLink :to="localePath('/')" class="brand"><UIcon name="i-lucide-sprout" aria-hidden="true" />PetMemoreal.</NuxtLink><p>{{ t('footer.line') }}</p></div><span>{{ t('footer.status') }}</span><a href="#top" class="text-link">{{ t('footer.top') }}<UIcon name="i-lucide-arrow-up" aria-hidden="true" /></a></footer>
  </div>
</template>
