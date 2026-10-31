export type GardenMarkerBounds = { left: number, top: number, right: number, bottom: number }
export type GardenMarkerLabelSize = { width: number, height: number, x?: number, y?: number }
export type GardenMarkerMetrics = {
  screenScale: number
  compact: boolean
  artScale: number
  labelScale: number
  labelY: number
  hit: GardenMarkerBounds
}

// Leave one source pixel per side for an inset nameplate within a 64px budget.
export const gardenMarkerLabelWidth = 62
export const gardenMarkerLabelLineHeight = 23
export const gardenMarkerLabelLines = 1
const minimumTarget = 44
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Local bounds shared by Pixi artwork and the native HTML place controls. */
export function getGardenMarkerHitBounds(
  metrics: Omit<GardenMarkerMetrics, 'hit'>,
  occupied: boolean,
  label?: GardenMarkerLabelSize
): GardenMarkerBounds {
  const { screenScale, artScale, labelScale, labelY, compact } = metrics
  // Preserve the original 90 × 100 place region, whose centre is at local y5.
  let left = -45, top = -45, right = 45, bottom = 55
  if (compact && occupied) {
    left = Math.min(left, -40 * artScale)
    top = Math.min(top, -45 * artScale)
    right = Math.max(right, 45 * artScale)
    bottom = Math.max(bottom, 40 * artScale)
    const width = label?.width ?? gardenMarkerLabelWidth
    const height = label?.height ?? gardenMarkerLabelLineHeight * gardenMarkerLabelLines
    const labelX = label?.x ?? 0, labelTop = label?.y ?? labelY
    left = Math.min(left, labelX - width * labelScale / 2)
    top = Math.min(top, labelTop)
    right = Math.max(right, labelX + width * labelScale / 2)
    bottom = Math.max(bottom, labelTop + height * labelScale)
  } else if (compact) {
    // Empty-place art grows around its circle centre, not around world origin.
    left = Math.min(left, -32 * artScale)
    right = Math.max(right, 32 * artScale)
    top = Math.min(top, -4 - 22 * artScale)
    bottom = Math.max(bottom, -4 + 31 * artScale)
  }
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2
  const halfWidth = Math.max((right - left) / 2, minimumTarget / screenScale / 2)
  const halfHeight = Math.max((bottom - top) / 2, minimumTarget / screenScale / 2)
  return { left: centerX - halfWidth, top: centerY - halfHeight, right: centerX + halfWidth, bottom: centerY + halfHeight }
}

/** Soft screen-size compensation; zoom/pan and permanent world anchors stay owned by the camera. */
export function getGardenMarkerMetrics(screenScale: number, compact: boolean, occupied: boolean): GardenMarkerMetrics {
  const scale = Number.isFinite(screenScale) && screenScale > 0 ? clamp(screenScale, 0.001, 1000) : 1
  const metrics = {
    screenScale: scale,
    compact,
    artScale: compact ? clamp(0.6 / scale, 1, 2) : 1,
    labelScale: compact ? clamp(0.7 / scale, 1, 3) : 1,
    labelY: compact ? 40 * clamp(0.6 / scale, 1, 2) + 4 / scale : 36
  }
  return { ...metrics, hit: getGardenMarkerHitBounds(metrics, occupied) }
}

export type GardenMarkerLabelInput = {
  place: number
  stone: GardenMarkerBounds
  label: GardenMarkerLabelSize
  preferredY: number
}
export type GardenMarkerLabelPosition = { x: number, y: number, inset: boolean }

/** All coordinates are world units; moving a caption never moves its monument. */
export function layoutGardenMarkerLabels(
  input: GardenMarkerLabelInput[],
  gap: number,
  obstacles: GardenMarkerBounds[] = []
): Record<number, GardenMarkerLabelPosition> {
  const spacing = Math.max(0, Number.isFinite(gap) ? gap : 0)
  const overlaps = (a: GardenMarkerBounds, b: GardenMarkerBounds) => a.left < b.right - 1e-8 && a.right > b.left + 1e-8
    && a.top < b.bottom - 1e-8 && a.bottom > b.top + 1e-8
  const box = (position: GardenMarkerLabelPosition, label: GardenMarkerLabelSize): GardenMarkerBounds => ({
    left: position.x, top: position.y, right: position.x + label.width, bottom: position.y + label.height
  })
  const candidates = input.map((item) => {
    const { stone, label } = item
    const centerX = (stone.left + stone.right - label.width) / 2
    const positions: GardenMarkerLabelPosition[] = [
      { x: centerX, y: item.preferredY, inset: false },
      { x: centerX, y: stone.top - spacing - label.height, inset: false },
      // Edge-aligned inset alternatives let adjacent captions alternate vertically
      // inside their own stones even when the world cannot fit a full text row.
      { x: centerX, y: stone.bottom - label.height, inset: true },
      { x: centerX, y: stone.top, inset: true },
      { x: centerX, y: (stone.top + stone.bottom - label.height) / 2, inset: true },
      { x: stone.left, y: stone.bottom - label.height, inset: true },
      { x: stone.right - label.width, y: stone.bottom - label.height, inset: true },
      { x: stone.left, y: stone.top, inset: true },
      { x: stone.right - label.width, y: stone.top, inset: true },
      { x: stone.left - spacing - label.width, y: stone.bottom - label.height, inset: false },
      { x: stone.right + spacing, y: stone.bottom - label.height, inset: false }
    ]
    const blockers = [...input.filter(other => other.place !== item.place).map(other => other.stone), ...obstacles]
    return {
      item,
      positions: positions.filter(position => !blockers.some(other => overlaps(box(position, label), other))),
      insets: positions.filter(position => position.inset)
    }
  }).sort((a, b) => a.positions.length - b.positions.length || a.item.place - b.item.place)
  const selected: { item: GardenMarkerLabelInput, position: GardenMarkerLabelPosition }[] = []
  for (const { item, positions, insets } of candidates) {
    const clear = (position: GardenMarkerLabelPosition) => !selected.some(other => overlaps(box(position, item.label), box(other.position, other.item.label)))
    let position = positions.find(candidate => clear(candidate))
    if (!position) {
      // A bounded one-label repair prevents an early otherwise valid choice
      // from taking the only remaining slot of a later, differently sized name.
      for (const candidate of positions) {
        const conflicts = selected.filter(other => overlaps(box(candidate, item.label), box(other.position, other.item.label)))
        if (conflicts.length !== 1) continue
        const conflict = conflicts[0]!
        const alternatives = candidates.find(other => other.item.place === conflict.item.place)!.positions
        const alternative = alternatives.find(other => !overlaps(box(other, conflict.item.label), box(candidate, item.label))
          && !selected.some(placed => placed !== conflict && overlaps(box(other, conflict.item.label), box(placed.position, placed.item.label))))
        if (!alternative) continue
        conflict.position = alternative
        position = candidate
        break
      }
    }
    // If the bounded search cannot find a clear slot, keep the least-overlapping
    // inset on its own stone. Normal fixed-world layouts are covered by the
    // clear candidates and one-label repair above.
    if (!position) {
      const blockers = [...input.filter(other => other.place !== item.place).map(other => other.stone), ...obstacles,
        ...selected.map(other => box(other.position, other.item.label))]
      const area = (candidate: GardenMarkerLabelPosition) => {
        const bounds = box(candidate, item.label)
        return blockers.reduce((sum, other) => sum + Math.max(0, Math.min(bounds.right, other.right) - Math.max(bounds.left, other.left))
          * Math.max(0, Math.min(bounds.bottom, other.bottom) - Math.max(bounds.top, other.top)), 0)
      }
      position = insets.reduce((best, candidate) => area(candidate) < area(best) ? candidate : best)
    }
    selected.push({ item, position })
  }
  return Object.fromEntries(selected.map(({ item, position }) => [item.place, position]))
}
