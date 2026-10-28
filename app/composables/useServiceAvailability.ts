export function useServiceAvailability() {
  const unavailable = useState<boolean>('service-unavailable', () => false)
  const session = useState<'guest' | 'member' | null>('service-session', () => null)
  const request = useRequestFetch()

  function markUnavailable() {
    unavailable.value = true
    session.value = null
  }

  async function check() {
    try {
      await request('/api/me', { retry: 0, timeout: 4000 })
      session.value = 'member'
      unavailable.value = false
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 401) {
        session.value = 'guest'
        unavailable.value = false
      } else markUnavailable()
    }
  }

  return { unavailable, session, check, markUnavailable }
}
