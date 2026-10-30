export type GardenTransitionPhase = 'idle' | 'approaching' | 'waiting' | 'preparing' | 'revealing' | 'error'
export type GardenTransitionDirection = 'forward' | 'backward' | 'lateral'
export type GardenTransitionTransform = { scale: number, x: number, y: number }
export type GardenTransitionFocus = { x: number, y: number, scale: number }
export type GardenTransitionRequest = {
  now: number
  hasFrame: boolean
  reducedMotion: boolean
  direction?: GardenTransitionDirection
  focus?: Partial<GardenTransitionFocus>
  skipApproach?: boolean
}

export const gardenTransitionTiming = Object.freeze({ approach: 300, reveal: 240, loaderDelay: 160, blur: 8 })
export const gardenTransitionScale = Object.freeze({ backward: .84, lateral: .86 })

const identity = (): GardenTransitionTransform => ({ scale: 1, x: 0, y: 0 })
const centered = (scale: number): GardenTransitionTransform => ({ scale, x: (1 - scale) / 2, y: (1 - scale) / 2 })
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback
const easeOut = (progress: number) => 1 - (1 - progress) ** 3
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

/** Presentation-only state. It never mutates the user's camera or owns a renderer. */
export function createGardenSceneTransition<Scene>(initial?: Scene) {
  let token = 0
  let phase: GardenTransitionPhase = 'idle'
  let displayed = initial
  let requested = initial
  let source = initial
  let hasFrame = initial !== undefined
  let sourceHasFrame = hasFrame
  let dataReady = true
  let failed = false
  let reducedMotion = false
  let direction: GardenTransitionDirection = 'forward'
  let now = 0
  let approachStarted = 0
  let waitingStarted = 0
  let revealStarted = 0
  let approachProgress = 1
  let revealProgress = 1
  let focus: GardenTransitionFocus = { x: .5, y: .5, scale: 1.65 }
  let transform = identity()
  let from = identity()
  let destination = identity()
  let revealFrom = identity()
  let blur = 0
  let cover = 0
  let fromBlur = 0
  let fromCover = 0

  function snapshot() {
    return {
      token, phase, displayed, requested, source, hasFrame, dataReady, failed, reducedMotion, direction,
      approachProgress, revealProgress, focus: { ...focus }, transform: { ...transform },
      zoom: transform.scale, blur, cover,
      canPrepare: phase === 'waiting' && dataReady && !failed,
      showLoader: (phase === 'waiting' || phase === 'preparing') && (!sourceHasFrame || now - waitingStarted >= gardenTransitionTiming.loaderDelay),
      interactive: phase === 'idle' && hasFrame
    }
  }

  function update(time: number) {
    now = Math.max(now, finite(time, now))
    if (phase === 'approaching') {
      approachProgress = clamp((now - approachStarted) / gardenTransitionTiming.approach, 0, 1)
      const eased = easeOut(approachProgress)
      transform = {
        scale: mix(from.scale, destination.scale, eased),
        x: mix(from.x, destination.x, eased),
        y: mix(from.y, destination.y, eased)
      }
      if (approachProgress === 1) transform = { ...destination }
      const closing = easeOut(clamp((approachProgress - .5) * 2, 0, 1))
      blur = mix(fromBlur, gardenTransitionTiming.blur, closing)
      cover = mix(fromCover, 1, closing)
      if (approachProgress === 1) {
        phase = failed ? 'error' : 'waiting'
        waitingStarted = approachStarted + gardenTransitionTiming.approach
      }
    } else if (phase === 'revealing') {
      revealProgress = clamp((now - revealStarted) / gardenTransitionTiming.reveal, 0, 1)
      const remaining = 1 - easeOut(revealProgress)
      transform = {
        scale: mix(revealFrom.scale, 1, 1 - remaining),
        x: mix(revealFrom.x, 0, 1 - remaining),
        y: mix(revealFrom.y, 0, 1 - remaining)
      }
      cover = remaining
      blur = reducedMotion ? 0 : gardenTransitionTiming.blur * remaining
      if (revealProgress === 1) {
        transform = identity()
        phase = 'idle'
        source = displayed
        sourceHasFrame = hasFrame
      }
    }
    return snapshot()
  }

  function request(target: Scene, options: GardenTransitionRequest) {
    update(options.now)
    const retry = phase === 'error'
    source = displayed
    sourceHasFrame = options.hasFrame
    hasFrame = options.hasFrame
    requested = target
    dataReady = false
    failed = false
    reducedMotion = options.reducedMotion
    direction = options.direction === 'backward' || options.direction === 'lateral' ? options.direction : 'forward'
    token++
    const suppliedScale = finite(options.focus?.scale, Number.NaN)
    const outgoingScale = suppliedScale < 1 ? clamp(suppliedScale, .65, .98) : direction === 'backward' ? gardenTransitionScale.backward : gardenTransitionScale.lateral
    focus = {
      x: direction === 'forward' ? clamp(finite(options.focus?.x, .5), 0, 1) : .5,
      y: direction === 'forward' ? clamp(finite(options.focus?.y, .5), 0, 1) : .5,
      scale: direction === 'forward' ? clamp(finite(options.focus?.scale, 1.65), 1, 3) : outgoingScale
    }
    from = hasFrame ? { ...transform } : identity()
    fromBlur = hasFrame ? blur : 0
    fromCover = hasFrame ? cover : 1
    destination = direction === 'forward' ? {
      scale: focus.scale,
      x: clamp(.5 - focus.x * focus.scale, 1 - focus.scale, 0),
      y: clamp(.5 - focus.y * focus.scale, 1 - focus.scale, 0)
    } : centered(focus.scale)
    approachStarted = now
    revealProgress = 0
    const approach = hasFrame && !reducedMotion && !options.skipApproach && !retry
    phase = approach ? 'approaching' : 'waiting'
    approachProgress = approach ? 0 : 1
    waitingStarted = now
    transform = approach ? { ...from } : reducedMotion || !hasFrame ? identity() : { ...from }
    blur = approach ? fromBlur : reducedMotion ? 0 : gardenTransitionTiming.blur
    cover = approach ? fromCover : 1
    return token
  }

  function markDataReady(revision: number, time: number) {
    if (revision !== token || phase === 'idle' || failed) return false
    update(time)
    dataReady = true
    return true
  }

  function beginPreparation(revision: number, time: number) {
    if (revision !== token) return false
    update(time)
    if (phase !== 'waiting' || !dataReady || failed) return false
    phase = 'preparing'
    return true
  }

  function markPrepared(revision: number, time: number) {
    if (revision !== token || phase !== 'preparing' || !dataReady || failed) return false
    update(time)
    displayed = requested
    hasFrame = true
    // A neighboring garden arrives from its pulled-back presentation. The
    // user's map camera stays untouched and the final presentation is 1:1.
    revealFrom = direction === 'lateral' && sourceHasFrame && !reducedMotion ? centered(focus.scale) : identity()
    transform = { ...revealFrom }
    cover = reducedMotion ? 0 : 1
    blur = reducedMotion ? 0 : gardenTransitionTiming.blur
    revealProgress = reducedMotion ? 1 : 0
    revealStarted = now
    phase = reducedMotion ? 'idle' : 'revealing'
    if (reducedMotion) { source = displayed; sourceHasFrame = true }
    return true
  }

  function fail(revision: number, time: number) {
    if (revision !== token || phase === 'idle') return false
    update(time)
    failed = true
    if (phase !== 'approaching') {
      phase = 'error'
      cover = 1
      blur = reducedMotion ? 0 : gardenTransitionTiming.blur
    }
    return true
  }

  function cancel(time: number) {
    update(time)
    if (phase !== 'idle') { displayed = source; hasFrame = sourceHasFrame }
    token++
    requested = displayed
    source = displayed
    sourceHasFrame = hasFrame
    phase = 'idle'
    dataReady = hasFrame
    failed = false
    approachProgress = 1
    revealProgress = 1
    transform = identity()
    blur = 0
    cover = 0
    return snapshot()
  }

  function setReducedMotion(value: boolean, time: number) {
    update(time)
    reducedMotion = value
    if (value) {
      transform = identity()
      blur = 0
      if (phase === 'approaching') {
        phase = failed ? 'error' : 'waiting'
        waitingStarted = now
        approachProgress = 1
        cover = 1
      } else if (phase === 'revealing') {
        phase = 'idle'
        revealProgress = 1
        cover = 0
        source = displayed
        sourceHasFrame = hasFrame
      }
    }
    return snapshot()
  }

  return { request, update, markDataReady, beginPreparation, markPrepared, fail, cancel, setReducedMotion, get state() { return snapshot() } }
}
