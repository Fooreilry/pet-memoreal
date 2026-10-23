import { getAuth } from '../../utils/auth'
import { getTrustedClientIP } from '../../utils/client-ip'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const request = toWebRequest(event)
  const headers = new Headers(request.headers)
  headers.delete('x-auth-client-ip')
  const ip = getTrustedClientIP(headers, getRequestIP(event))
  if (ip) headers.set('x-auth-client-ip', ip)
  return getAuth().handler(new Request(request, { headers }))
})
