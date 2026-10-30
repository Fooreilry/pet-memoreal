import { gardenTransitionScale, gardenTransitionTiming } from './gardenSceneTransition'

/** The camera and DOM use the visible viewport; only the drawing has a gutter. */
export function getGardenSceneFrame(width: number, height: number, expanded = true) {
  const viewWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1))
  const viewHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1))
  const minimumScale = Math.min(gardenTransitionScale.backward, gardenTransitionScale.lateral)
  const gutter = (size: number) => expanded ? Math.ceil(size * (1 / minimumScale - 1) / 2 + gardenTransitionTiming.blur * 4) : 0
  const margin = { x: gutter(viewWidth), y: gutter(viewHeight) }
  return { viewWidth, viewHeight, margin, width: viewWidth + margin.x * 2, height: viewHeight + margin.y * 2 }
}

export type GardenSceneFrame = ReturnType<typeof getGardenSceneFrame>
