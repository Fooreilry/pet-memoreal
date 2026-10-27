export function getGardenProjection(viewWidth: number, viewHeight: number, worldWidth: number, worldHeight: number, padding = 0) {
  const inset = Math.max(0, Math.min(padding, (Math.min(viewWidth, viewHeight) - 1) / 2))
  const scale = Math.min((viewWidth - inset * 2) / worldWidth, (viewHeight - inset * 2) / worldHeight)
  const width = worldWidth * scale, height = worldHeight * scale
  return { scale, width, height, offsetX: (viewWidth - width) / 2, offsetY: (viewHeight - height) / 2 }
}

export type GardenProjection = ReturnType<typeof getGardenProjection>
export type GardenView = { left: number, right: number, top: number, bottom: number }

export function gardenBoundsVisible(bounds: GardenView, view: GardenView, overscan = 40) {
  return bounds.left < view.right + overscan && bounds.right > view.left - overscan
    && bounds.top < view.bottom + overscan && bounds.bottom > view.top - overscan
}
