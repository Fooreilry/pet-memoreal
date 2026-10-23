import { checkRemoteDatabaseTargets } from '../../server/db/config'

export function checkRemoteTarget() {
  if (!process.argv.includes('--remote')) return
  checkRemoteDatabaseTargets()
}
