import { demoGardens } from '../data/demoGardens'

export type GardenOverviewRect = { x: number, y: number, width: number, height: number }
export type GardenOverviewTile = GardenOverviewRect & {
  garden: typeof demoGardens[number]
  illustration: GardenOverviewRect
  caption: GardenOverviewRect
}

export const gardenOverviewPreviewSize = { width: 320, height: 240 } as const

const dimension = (value: number) => Number.isFinite(value) && value > 0 ? value : 1

/** Shared card, artwork and caption geometry for Pixi and native choice buttons. */
export function getGardenOverviewLayout(width: number, height: number, compact = false): GardenOverviewTile[] {
  const viewWidth = dimension(width), viewHeight = dimension(height)
  if (!compact) {
    // Keep the desktop layout exactly as before, including fractional sizes.
    const regular = viewWidth > 62 && viewHeight > 62
    const margin = regular ? 24 : Math.min(24, viewWidth / 8, viewHeight / 8)
    const gap = regular ? 14 : Math.min(14, (viewWidth - margin * 2) / 3, (viewHeight - margin * 2) / 3)
    const tileWidth = (viewWidth - margin * 2 - gap) / 2
    const tileHeight = (viewHeight - margin * 2 - gap) / 2
    return demoGardens.map((garden, index) => ({
      garden,
      x: margin + index % 2 * (tileWidth + gap),
      y: margin + Math.floor(index / 2) * (tileHeight + gap),
      width: tileWidth,
      height: tileHeight,
      illustration: { x: 0, y: 0, width: tileWidth, height: tileHeight },
      caption: { x: 0, y: tileHeight, width: tileWidth, height: 0 }
    }))
  }

  const short = viewHeight < 360
  const margin = Math.min(short ? 8 : 12, viewWidth / 8, viewHeight / 8)
  const gap = Math.min(short ? 8 : 10, (viewWidth - margin * 2) / 3, (viewHeight - margin * 2) / 3)
  const tileWidth = Math.min(300, (viewWidth - margin * 2 - gap) / 2)
  // Narrow captions reserve three lines; wide landscape cards need only one.
  const desiredCaptionHeight = tileWidth < 160 ? 104 : short ? tileWidth < 260 ? 84 : 68 : 92
  const naturalIllustrationHeight = tileWidth * gardenOverviewPreviewSize.height / gardenOverviewPreviewSize.width
  const tileHeight = Math.min(naturalIllustrationHeight + desiredCaptionHeight, (viewHeight - margin * 2 - gap) / 2)
  // Degenerate observer sizes must still produce finite, contained rectangles.
  const minimumIllustrationHeight = Math.min(1, tileHeight / 2, naturalIllustrationHeight)
  const captionHeight = Math.min(desiredCaptionHeight, tileHeight - minimumIllustrationHeight)
  const illustrationHeight = tileHeight - captionHeight
  const illustrationWidth = illustrationHeight * gardenOverviewPreviewSize.width / gardenOverviewPreviewSize.height
  const startX = (viewWidth - tileWidth * 2 - gap) / 2
  const startY = (viewHeight - tileHeight * 2 - gap) / 2
  return demoGardens.map((garden, index) => ({
    garden,
    x: startX + index % 2 * (tileWidth + gap),
    y: startY + Math.floor(index / 2) * (tileHeight + gap),
    width: tileWidth,
    height: tileHeight,
    illustration: { x: (tileWidth - illustrationWidth) / 2, y: 0, width: illustrationWidth, height: illustrationHeight },
    caption: { x: 0, y: illustrationHeight, width: tileWidth, height: captionHeight }
  }))
}
