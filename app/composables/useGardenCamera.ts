import type { Ref } from 'vue'

type Point = { x: number, y: number }

export function useGardenCamera(viewport: Ref<HTMLElement | undefined>, enabled: Ref<boolean>) {
  const camera = reactive({ zoom: 1, x: 0, y: 0 })
  const size = reactive({ width: 0, height: 0 })
  const interacting = ref(false)
  const dragging = ref(false)
  const pointers = new Map<number, Point>()
  let previous: { center: Point, distance: number } | undefined
  let origin: Point | undefined
  let suppressUntil = 0
  let settle: ReturnType<typeof setTimeout> | undefined

  function constrain() {
    camera.x = Math.max(size.width * (1 - camera.zoom), Math.min(0, camera.x))
    camera.y = Math.max(size.height * (1 - camera.zoom), Math.min(0, camera.y))
  }

  function stopInteraction() {
    clearTimeout(settle)
    pointers.clear()
    previous = undefined
    origin = undefined
    interacting.value = false
    dragging.value = false
  }

  function reset() {
    stopInteraction()
    camera.zoom = 1
    camera.x = 0
    camera.y = 0
  }

  function resize(width: number, height: number) {
    // Keep the same normalized view center when the container changes size.
    if (size.width && size.height) {
      camera.x *= width / size.width
      camera.y *= height / size.height
    }
    size.width = width
    size.height = height
    stopInteraction()
    constrain()
  }

  function pan(dx: number, dy: number) {
    camera.x += dx
    camera.y += dy
    constrain()
  }

  function zoomTo(zoom: number, anchor = { x: size.width / 2, y: size.height / 2 }) {
    const next = Math.max(1, Math.min(4, zoom))
    const ratio = next / camera.zoom
    camera.x = anchor.x - (anchor.x - camera.x) * ratio
    camera.y = anchor.y - (anchor.y - camera.y) * ratio
    camera.zoom = next
    constrain()
  }

  function local(event: { clientX: number, clientY: number }): Point {
    const bounds = viewport.value!.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  function measure() {
    const values = [...pointers.values()]
    const first = values[0]!
    const second = values[1] ?? first
    return {
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: values.length > 1 ? Math.hypot(first.x - second.x, first.y - second.y) : 0
    }
  }

  function pointerDown(event: PointerEvent) {
    if (!enabled.value || event.button !== 0) return
    clearTimeout(settle)
    if (!pointers.size) {
      suppressUntil = 0
      origin = local(event)
    }
    pointers.set(event.pointerId, local(event))
    previous = measure()
    if (pointers.size > 1) {
      interacting.value = true
      dragging.value = true
      viewport.value?.setPointerCapture(event.pointerId)
    }
  }

  function pointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId) || !enabled.value) return
    const point = local(event)
    pointers.set(event.pointerId, point)
    const next = measure()
    if (!dragging.value && origin && Math.hypot(point.x - origin.x, point.y - origin.y) > 6) {
      dragging.value = true
      interacting.value = true
    }
    if (dragging.value && previous) {
      event.preventDefault()
      viewport.value?.setPointerCapture(event.pointerId)
      pan(next.center.x - previous.center.x, next.center.y - previous.center.y)
      if (pointers.size > 1 && previous.distance > 0) zoomTo(camera.zoom * next.distance / previous.distance, next.center)
      suppressUntil = Date.now() + 500
    }
    previous = next
  }

  function pointerUp(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    if (dragging.value) suppressUntil = Date.now() + 350
    if (pointers.size) {
      previous = measure()
      return
    }
    previous = undefined
    origin = undefined
    dragging.value = false
    settle = setTimeout(() => { interacting.value = false }, 150)
  }

  function clickCapture(event: MouseEvent) {
    if (event.detail !== 0 && Date.now() < suppressUntil) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }

  function wheel(event: WheelEvent) {
    if (!enabled.value) return
    event.preventDefault()
    interacting.value = true
    clearTimeout(settle)
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1)
    zoomTo(camera.zoom * Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.003), local(event))
    settle = setTimeout(() => { interacting.value = false }, 150)
  }

  function keydown(event: KeyboardEvent) {
    if (!enabled.value || event.target !== viewport.value || event.ctrlKey || event.metaKey || event.altKey) return
    const step = event.shiftKey ? 100 : 50
    switch (event.key) {
      case 'ArrowLeft': pan(step, 0); break
      case 'ArrowRight': pan(-step, 0); break
      case 'ArrowUp': pan(0, step); break
      case 'ArrowDown': pan(0, -step); break
      case '+': case '=': zoomTo(camera.zoom * 1.25); break
      case '-': case '_': zoomTo(camera.zoom / 1.25); break
      case 'Home': case '0': reset(); break
      default: return
    }
    event.preventDefault()
  }

  function reveal(x: number, y: number) {
    const screenX = x * size.width * camera.zoom + camera.x
    const screenY = y * size.height * camera.zoom + camera.y
    const padding = Math.min(72, size.width / 4, size.height / 4)
    pan(
      screenX < padding ? padding - screenX : screenX > size.width - padding ? size.width - padding - screenX : 0,
      screenY < padding ? padding - screenY : screenY > size.height - padding ? size.height - padding - screenY : 0
    )
  }

  watch(enabled, (value) => { if (!value) stopInteraction() })
  onBeforeUnmount(stopInteraction)
  return { camera, interacting, dragging, reset, resize, zoomTo, reveal, pointerDown, pointerMove, pointerUp, clickCapture, wheel, keydown }
}
