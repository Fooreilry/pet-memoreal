import { setGardenSessionSeed } from '../data/gardenLayout'

export default defineNuxtPlugin(() => {
  const { seed, cookie } = useGardenSession()
  watch(seed, setGardenSessionSeed, { immediate: true, flush: 'sync' })
  // Nuxt's cookie channel shares a successful auth change with already-open tabs.
  watch(cookie, value => {
    const next = Number(value)
    if (!Number.isInteger(next) || next <= 0 || next > 0xffffffff || next === seed.value) return
    seed.value = next
  })
})
