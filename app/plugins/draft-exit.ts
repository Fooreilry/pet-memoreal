export type DraftExitParticipant = {
  confirmDiscard: () => Promise<boolean>
  allowNavigation: () => void
}

export type DraftExitPermit = { commit: () => void, finish: () => void }

export default defineNuxtPlugin(() => {
  // Each Nuxt application owns its registry; server requests never share draft callbacks.
  const participants = new Set<DraftExitParticipant>()
  const pending = ref(false)
  let preparing = false

  function register(participant: DraftExitParticipant) {
    participants.add(participant)
    return () => { participants.delete(participant) }
  }

  async function prepare(): Promise<DraftExitPermit | undefined> {
    if (preparing || pending.value) return
    preparing = true
    try {
      const approved = [...participants]
      for (const participant of approved) {
        if (participants.has(participant) && !await participant.confirmDiscard()) return
      }
      pending.value = true
      let finished = false
      let committed = false
      return {
        commit() {
          if (finished || committed) return
          committed = true
          for (const participant of approved) {
            if (participants.has(participant)) participant.allowNavigation()
          }
        },
        finish() {
          if (finished) return
          finished = true
          pending.value = false
        }
      }
    } finally {
      preparing = false
    }
  }

  return { provide: { draftExit: { pending: readonly(pending), register, prepare } } }
})
