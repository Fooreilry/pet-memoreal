<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { authRedirect } from '../utils/authRedirect'

const props = defineProps<{ mode: 'register' | 'login' | 'forgot-password' | 'reset-password' | 'verify-email' }>()
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const auth = useAuthClient()
const redirect = computed(() => authRedirect(route.query.redirect))
const authLink = (path: string) => ({ path: localePath(path), query: redirect.value ? { redirect: redirect.value } : {} })
const ready = ref(false)
const busy = ref(false)
const success = ref(false)
const errorKey = ref('')
const container = useTemplateRef('container')
const form = useTemplateRef('form')
const notice = useTemplateRef('notice')
const state = reactive({ name: '', email: '', password: '', confirmPassword: '' })
const passwordVisible = ref(false)
const hasPassword = computed(() => ['register', 'login', 'reset-password'].includes(props.mode))
const newPassword = computed(() => ['register', 'reset-password'].includes(props.mode))
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const invalidLink = computed(() => props.mode === 'reset-password' && (!token.value || !!route.query.error))
let active = true
const schema = computed(() => z.object({
  name: props.mode === 'register' ? z.string().trim().min(1, t('auth.nameRequired')).max(80, t('auth.nameLimit')) : z.string(),
  email: props.mode !== 'reset-password' ? z.email(t('auth.emailInvalid')).trim().toLowerCase() : z.string(),
  password: hasPassword.value ? z.string().min(newPassword.value ? 8 : 1, t(newPassword.value ? 'auth.passwordRules' : 'auth.passwordRequired')).max(128, t('auth.passwordRules')) : z.string(),
  confirmPassword: z.string()
}).refine(value => !newPassword.value || value.password === value.confirmPassword, { message: t('auth.passwordMismatch'), path: ['confirmPassword'] }))

useSeoMeta({ title: () => `${t(`auth.titles.${props.mode}`)} — PetMemoreal` })
onMounted(() => { ready.value = true })
onBeforeUnmount(() => { active = false })
watch(locale, () => form.value?.clear())

function messageFor(code?: string, status?: number) {
  if (status === 429) return 'auth.errors.rateLimit'
  if (code === 'EMAIL_NOT_VERIFIED') return 'auth.errors.unverified'
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'auth.errors.credentials'
  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') return 'auth.errors.invalidLink'
  return 'auth.errors.generic'
}

async function focusError() {
  await nextTick()
  container.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function submit(event: FormSubmitEvent<z.output<typeof schema.value>>) {
  if (busy.value) return
  busy.value = true
  errorKey.value = ''
  const data = event.data
  const callback = new URL(localePath('/login'), window.location.origin)
  callback.searchParams.set('verified', '1')
  if (redirect.value) callback.searchParams.set('redirect', redirect.value)
  const callbackURL = callback.href
  try {
    const result = props.mode === 'register'
      ? await auth.signUp.email({ name: data.name, email: data.email, password: data.password, callbackURL })
      : props.mode === 'login'
        ? await auth.signIn.email({ email: data.email, password: data.password })
        : props.mode === 'forgot-password'
          ? await auth.requestPasswordReset({ email: data.email, redirectTo: `${window.location.origin}${localePath('/reset-password')}` })
          : props.mode === 'verify-email'
            ? await auth.sendVerificationEmail({ email: data.email, callbackURL })
            : await auth.resetPassword({ token: token.value, newPassword: data.password })
    if (!active) return
    if (result.error) {
      errorKey.value = messageFor(result.error.code, result.error.status)
      return
    }
    state.password = ''
    state.confirmPassword = ''
    if (props.mode === 'login') {
      await navigateTo(redirect.value ?? localePath('/account'))
    } else {
      success.value = true
      if (props.mode === 'reset-password') await navigateTo({ path: route.path, query: {} }, { replace: true })
      passwordVisible.value = false
      await nextTick()
      notice.value?.focus()
    }
  } catch {
    if (active) errorKey.value = 'auth.errors.generic'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell>
    <div ref="container">
      <h1 id="auth-title">{{ t(`auth.titles.${mode}`) }}</h1>
      <p class="auth-intro">{{ t(`auth.descriptions.${mode}`) }}</p>
      <div v-if="success" ref="notice" role="status" class="auth-notice" tabindex="-1">
        <UIcon name="i-lucide-mail-check" aria-hidden="true" />
        <p>{{ t(mode === 'reset-password' ? 'auth.passwordChanged' : mode === 'register' ? 'auth.registrationSent' : 'auth.emailSent') }}</p>
        <UButton :to="authLink('/login')" color="primary">{{ t('auth.actions.login') }}</UButton>
        <NuxtLink v-if="mode === 'register'" :to="authLink('/verify-email')" class="auth-link">{{ t('auth.resend') }}</NuxtLink>
      </div>
      <template v-else>
        <UAlert v-if="invalidLink || (mode === 'login' && route.query.error)" color="error" variant="soft" :title="t('auth.errors.invalidLink')" class="mb-5" role="alert" />
        <UAlert v-else-if="mode === 'login' && route.query.verified === '1'" color="success" variant="soft" :title="t('auth.verified')" class="mb-5" role="status" />
        <!-- Validate on submit so disappearing errors do not move the button during a click. -->
        <UForm v-if="!invalidLink" ref="form" :schema="schema" :state="state" :validate-on="[]" :disabled="!ready || busy" :loading-auto="false" :aria-busy="busy" novalidate class="auth-form" @submit="submit" @error="focusError">
          <UFormField v-if="mode === 'register'" name="name" :label="t('auth.name')" required>
            <UInput v-model="state.name" autocomplete="name" :maxlength="80" class="w-full" aria-required="true" />
          </UFormField>
          <UFormField v-if="mode !== 'reset-password'" name="email" :label="t('auth.email')" required>
            <UInput v-model="state.email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" :spellcheck="false" :maxlength="254" class="w-full" aria-required="true" />
          </UFormField>
          <UFormField v-if="hasPassword" name="password" :label="t('auth.password')" :help="newPassword ? t('auth.passwordRules') : undefined" required>
            <template v-if="mode === 'login'" #hint><NuxtLink :to="authLink('/forgot-password')" class="auth-password-help">{{ t('auth.forgotPassword') }}</NuxtLink></template>
            <UInput v-model="state.password" :type="passwordVisible ? 'text' : 'password'" :autocomplete="newPassword ? 'new-password' : 'current-password'" :maxlength="128" class="w-full" aria-required="true" :ui="{ base: 'pe-14', trailing: 'pe-1' }">
              <template #trailing><UButton type="button" color="neutral" variant="ghost" :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="t(passwordVisible ? 'auth.hidePassword' : 'auth.showPassword')" :aria-pressed="passwordVisible" @click="passwordVisible = !passwordVisible" /></template>
            </UInput>
          </UFormField>
          <UFormField v-if="newPassword" name="confirmPassword" :label="t('auth.confirmPassword')" required>
            <UInput v-model="state.confirmPassword" :type="passwordVisible ? 'text' : 'password'" autocomplete="new-password" :maxlength="128" class="w-full" aria-required="true" />
          </UFormField>
          <UAlert v-if="errorKey" color="error" variant="soft" :title="t(errorKey)" role="alert" />
          <UButton type="submit" color="primary" size="lg" block :disabled="!ready || busy" :loading="busy">{{ t(`auth.actions.${mode}`) }}</UButton>
        </UForm>
        <div class="auth-links">
          <p v-if="mode === 'login'" class="auth-switch">{{ t('auth.accountPrompts.login') }} <NuxtLink :to="authLink('/register')">{{ t('auth.createAccount') }}</NuxtLink></p>
          <p v-else-if="mode === 'register'" class="auth-switch">{{ t('auth.accountPrompts.register') }} <NuxtLink :to="authLink('/login')">{{ t('auth.backToLogin') }}</NuxtLink></p>
          <NuxtLink v-else :to="authLink('/login')">{{ t('auth.backToLogin') }}</NuxtLink>
          <NuxtLink v-if="mode === 'reset-password'" :to="authLink('/forgot-password')">{{ t('auth.forgotPassword') }}</NuxtLink>
          <p v-if="mode === 'login' || mode === 'register'" class="auth-support">{{ t('auth.emailConfirmationHelp') }} <NuxtLink :to="authLink('/verify-email')">{{ t('auth.resend') }}</NuxtLink></p>
        </div>
      </template>
    </div>
  </AuthShell>
</template>
