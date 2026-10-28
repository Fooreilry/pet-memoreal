import { getAuth } from '../utils/auth'

export default defineNitroPlugin(() => {
  // Keep the public site available if auth configuration is temporarily invalid.
  // getAuth retries lazily on later requests because failed initialization is not cached.
  try {
    getAuth()
  } catch {
    console.error('Authentication initialization unavailable')
  }
})
