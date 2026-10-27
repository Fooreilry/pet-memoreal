<script setup lang="ts">
import '~/assets/css/auth.css'

const { t, locale } = useI18n()
const localePath = useLocalePath()
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div class="auth-page">
    <img class="auth-background" src="/images/34a7d373-ee89-4a01-a2e3-7fc7b31039c3.jpg" alt="" width="1024" height="572" fetchpriority="high">
    <a href="#auth-main" class="skip-link">{{ t('nav.skip') }}</a>
    <header class="site-header shell">
      <NuxtLink :to="localePath('/')" class="brand"><span class="brand-mark"><UIcon name="i-lucide-sprout" aria-hidden="true" /></span><span>PetMemoreal<span class="brand-dot">.</span></span></NuxtLink>
      <div class="auth-header-actions">
        <NuxtLink :to="localePath('/')" class="auth-home-link"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />{{ t('auth.home') }}</NuxtLink>
        <LanguageSwitch />
      </div>
    </header>
    <main id="auth-main" class="auth-layout shell">
      <aside class="auth-aside">
        <p class="eyebrow"><span class="small-line" />{{ t('hero.label') }}</p>
        <h2>{{ t('auth.asideTitle') }}</h2>
        <p class="auth-aside-description">{{ t('auth.asideDescription') }}</p>
        <div class="auth-aside-note"><UIcon name="i-lucide-sprout" aria-hidden="true" /><p>{{ t('landing.accountNote') }}</p></div>
      </aside>
      <section class="auth-card"><slot /></section>
    </main>
    <footer class="auth-footer shell"><p>{{ t('hero.artCaption') }}</p><NuxtLink :to="localePath('/gardens')">{{ t('garden.enter') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink></footer>
  </div>
</template>
