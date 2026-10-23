import { getAuth } from '../utils/auth'

export default defineNitroPlugin(() => {
  // Validate configuration at runtime, while keeping build independent of secrets.
  getAuth()
})
