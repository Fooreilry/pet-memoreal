export function useGardenSession() {
  const seed = useState<number>('garden-session-seed', () => 0)
  const cookie = useCookie<string | undefined>('petmemoreal_garden_session', {
    path: '/', sameSite: 'lax', secure: import.meta.client && location.protocol === 'https:'
  })

  function rotate() {
    if (!import.meta.client) return
    let next = 0
    while (!next || next === seed.value) next = crypto.getRandomValues(new Uint32Array(1))[0]!
    seed.value = next
    cookie.value = String(next)
  }

  if (import.meta.client) {
    if (!seed.value) {
      const saved = Number(cookie.value)
      if (Number.isInteger(saved) && saved > 0 && saved <= 0xffffffff) seed.value = saved
      else rotate()
    }
  }

  return { seed, rotate, cookie }
}
