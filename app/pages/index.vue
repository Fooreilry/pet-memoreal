<script setup lang="ts">
import '~/assets/css/landing.css'
import { demoGardens } from '../data/demoGardens'

definePageMeta({ middleware: 'landing', colorMode: 'light' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const showBackToTop = ref(false)
const gardenIcons = ['i-lucide-flower-2', 'i-lucide-waves', 'i-lucide-trees', 'i-lucide-mountain']

function syncBackToTop() {
  showBackToTop.value = window.scrollY > 0
}

onMounted(() => {
  syncBackToTop()
  window.addEventListener('scroll', syncBackToTop, { passive: true })
  window.addEventListener('pageshow', syncBackToTop)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', syncBackToTop)
  window.removeEventListener('pageshow', syncBackToTop)
})
useHead({ htmlAttrs: { lang: () => locale.value } })
useSeoMeta({ title: () => t('meta.title'), description: () => t('meta.description'), ogTitle: () => t('meta.title'), ogDescription: () => t('meta.description') })
</script>

<template>
  <div id="top" class="landing" tabindex="-1">
    <a href="#main" class="skip-link">{{ t('nav.skip') }}</a>
    <div class="landing-header">
      <header class="site-header shell">
      <NuxtLink :to="localePath('/')" class="brand" aria-label="PetMemoreal">
        <span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span>
        <span>PetMemoreal</span>
      </NuxtLink>
      <nav class="desktop-nav" :aria-label="t('nav.about')">
        <a href="#about">{{ t('nav.about') }}</a>
        <NuxtLink :to="localePath('/login')" no-prefetch>{{ t('hero.secondary') }}</NuxtLink>
        <a href="#how">{{ t('nav.how') }}</a>
        <a href="#questions">{{ t('nav.questions') }}</a>
      </nav>
      <div class="header-actions">
        <NuxtLink :to="switchLocalePath(locale === 'ru' ? 'en' : 'ru')" class="language-link" :aria-label="t('nav.language')" :lang="locale === 'ru' ? 'en' : 'ru'">{{ locale === 'ru' ? 'EN' : 'RU' }}</NuxtLink>
        <NuxtLink :to="localePath('/login')" no-prefetch class="auth-header-login">{{ t('auth.actions.login') }}</NuxtLink>
        <NuxtLink :to="localePath('/register')" no-prefetch class="landing-button header-cta">{{ t('auth.createAccount') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
      </div>
      </header>
    </div>

    <main id="main">
      <section class="hero-section" aria-labelledby="hero-title">
        <img class="hero-background" src="/images/34a7d373-ee89-4a01-a2e3-7fc7b31039c3.jpg" alt="" width="1024" height="572" fetchpriority="high">
        <div class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow"><span class="small-line" />{{ t('hero.label') }}</p>
          <h1 id="hero-title">{{ t('hero.title') }}<br><em>{{ t('hero.accent') }}</em></h1>
          <p class="hero-description">{{ t('landing.intro') }}</p>
          <div class="hero-actions">
            <NuxtLink :to="localePath('/register')" no-prefetch class="landing-button">{{ t('hero.primary') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
            <NuxtLink :to="localePath('/login')" no-prefetch class="text-link">{{ t('hero.secondary') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
          </div>
          <p class="launch-note"><UIcon name="i-lucide-sprout" aria-hidden="true" />{{ t('landing.heroNote') }}</p>
        </div>
        </div>
        <div class="hero-bottom shell">
          <a href="#about" class="hero-scroll"><UIcon name="i-lucide-arrow-down" aria-hidden="true" />{{ t('landing.scroll') }}</a>
          <p class="hero-caption">{{ t('hero.artCaption') }}</p>
        </div>
      </section>

      <section id="about" class="about-section shell" aria-labelledby="about-title">
        <div><p class="eyebrow">{{ t('about.label') }}</p><h2 id="about-title">{{ t('about.title') }}</h2></div>
        <div class="about-copy"><p>{{ t('about.description') }}</p><span>{{ t('about.detail') }}</span></div>
      </section>

      <section id="gardens" class="discover-section shell" aria-labelledby="discover-title">
        <div class="discover-heading">
          <div class="section-heading"><p class="eyebrow">{{ t('landing.discoverLabel') }}</p><h2 id="discover-title">{{ t('landing.discoverTitle') }}</h2></div>
          <p>{{ t('landing.discoverDescription') }}</p>
        </div>
        <div class="garden-doors">
          <article v-for="(garden, index) in demoGardens" :key="garden.id" class="garden-door" :class="`door-theme-${garden.id}`" :data-testid="`discover-${garden.id}`">
            <div class="door-landscape" aria-hidden="true">
              <span class="door-orbit" /><span class="door-sun" /><span class="door-hill door-hill-back" /><span class="door-hill door-hill-front" />
              <UIcon :name="gardenIcons[index]!" /><span class="door-number">0{{ index + 1 }}</span>
            </div>
            <div class="door-caption"><div><h3>{{ t(`garden.names.${garden.id}`) }}</h3><p>{{ t(`landing.gardens.${garden.id}`) }}</p></div></div>
          </article>
        </div>
      </section>

      <div class="how-band">
        <section id="how" class="how-section shell" aria-labelledby="how-title">
          <div class="journey-intro">
            <div class="section-heading"><p class="eyebrow">{{ t('how.label') }}</p><h2 id="how-title">{{ t('how.title') }}</h2></div>
            <div class="journey-note"><UIcon name="i-lucide-book-heart" aria-hidden="true" /><p>{{ t('landing.journeyNote') }}</p></div>
          </div>
          <ol class="journey-list">
            <li v-for="index in 3" :key="index">
              <span class="journey-number" aria-hidden="true">0{{ index }}</span>
              <div><h3>{{ t(`how.items.${index - 1}.title`) }}</h3><p>{{ t(`how.items.${index - 1}.description`) }}</p></div>
            </li>
          </ol>
        </section>
      </div>

      <section class="values-section" aria-labelledby="values-title">
        <div class="shell values-message">
          <div class="values-mark" aria-hidden="true"><UIcon name="i-lucide-sprout" /></div>
          <p class="eyebrow">{{ t('values.label') }}</p>
          <h2 id="values-title">{{ t('values.title') }}</h2>
          <p class="values-description">{{ t('landing.valuesDescription') }}</p>
          <p class="values-aside">{{ t('landing.valuesAside') }}</p>
        </div>
      </section>

      <section id="questions" class="faq-section shell" aria-labelledby="faq-title">
        <div class="section-heading"><p class="eyebrow">{{ t('faq.label') }}</p><h2 id="faq-title">{{ t('faq.title') }}</h2></div>
        <div class="faq-list"><article v-for="index in 4" :key="index"><h3>{{ t(`faq.items.${index - 1}.question`) }}</h3><p>{{ t(`faq.items.${index - 1}.answer`) }}</p></article></div>
      </section>
      <section class="invitation shell" aria-labelledby="invitation-title">
        <UIcon name="i-lucide-sprout" class="invitation-sprout" aria-hidden="true" />
        <p class="eyebrow">{{ t('landing.invitationLabel') }}</p>
        <h2 id="invitation-title">{{ t('landing.invitationTitle') }}</h2>
        <p>{{ t('landing.invitationDescription') }}</p>
        <div class="invitation-actions">
          <NuxtLink :to="localePath('/register')" no-prefetch class="landing-button invitation-primary">{{ t('hero.primary') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
          <NuxtLink :to="localePath('/register')" no-prefetch class="text-link">{{ t('auth.createAccount') }}<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
        </div>
        <span class="invitation-note">{{ t('landing.invitationNote') }}</span>
      </section>
    </main>

    <footer class="site-footer shell"><div><NuxtLink :to="localePath('/')" class="brand"><UIcon name="i-lucide-sprout" aria-hidden="true" />PetMemoreal</NuxtLink><p>{{ t('footer.line') }}</p></div><span>{{ t('footer.status') }}</span></footer>
    <a v-show="showBackToTop" href="#top" class="back-to-top" :aria-label="t('footer.top')" data-testid="back-to-top"><UIcon name="i-lucide-arrow-up" aria-hidden="true" /><span>{{ t('footer.top') }}</span></a>
  </div>
</template>
