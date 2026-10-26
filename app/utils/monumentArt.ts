import { Graphics, GraphicsContext } from 'pixi.js'
import type { MonumentKind } from '../data/monuments'

type StonePalette = { face: number, side: number, edge: number, engraving: number }
const palettes: Record<MonumentKind, StonePalette> = {
  arch: { face: 0xe6dfc8, side: 0xa2aa91, edge: 0xf8eed7, engraving: 0x7c8c73 },
  tablet: { face: 0xd4dccc, side: 0x8c9f8b, edge: 0xeaf0dd, engraving: 0x637e6d },
  stele: { face: 0xe0cdb5, side: 0xa69a84, edge: 0xf3e4cb, engraving: 0x84775f },
  boulder: { face: 0xb9c3ac, side: 0x7d917c, edge: 0xd4dcc4, engraving: 0x526e5d }
}

function silhouette(g: GraphicsContext, kind: MonumentKind) {
  if (kind === 'arch') {
    g.moveTo(-26, 22).lineTo(-26, -14).bezierCurveTo(-26, -49, 26, -49, 26, -14).lineTo(26, 22).closePath()
  } else if (kind === 'tablet') {
    g.roundRect(-31, -31, 62, 54, 8)
  } else if (kind === 'stele') {
    g.moveTo(-23, 22).lineTo(-27, -18).lineTo(0, -44).lineTo(27, -18).lineTo(23, 22).closePath()
  } else {
    g.moveTo(-29, 23).bezierCurveTo(-38, 12, -36, -9, -28, -22)
      .quadraticCurveTo(-21, -34, -11, -31).quadraticCurveTo(0, -40, 15, -31)
      .bezierCurveTo(31, -30, 38, -12, 33, 4).quadraticCurveTo(37, 24, 21, 26)
      .quadraticCurveTo(-4, 29, -29, 23).closePath()
  }
  return g
}

function paw(g: GraphicsContext, y: number, color: number) {
  // A shallow, softly shaded carving rather than a dark printed icon.
  for (const offset of [1, 0]) {
    g.ellipse(0, y + offset, 6.5, 5.5)
    for (const [x, dy] of [[-10, -8], [-4, -13], [4, -13], [10, -8]]) g.ellipse(x!, y + dy! + offset, 2.7, 3.3)
    g.fill({ color: offset ? 0xfaf2dd : color, alpha: offset ? 0.65 : 0.85 })
  }
}

function moss(g: GraphicsContext, kind: MonumentKind) {
  const left = kind === 'tablet' || kind === 'boulder' ? -26 : -21
  // Only two small patches; no noise texture, filter, particles or animation.
  g.ellipse(left + 3, 20, 7, 2.8).ellipse(left, 18, 3, 4).ellipse(left + 8, 21, 3.5, 2).fill({ color: 0x65835a, alpha: 0.8 })
  g.ellipse(left + 2, 17, 2.5, 1.5).ellipse(left + 6, 20, 2, 1).fill({ color: 0xa6b27b, alpha: 0.75 })
  g.ellipse(21, 24, 4.5, 1.8).ellipse(24, 22, 2.5, 2).fill({ color: 0x789363, alpha: 0.65 })
}

function drawMonument(kind: MonumentKind) {
  const g = new GraphicsContext()
  const p = palettes[kind]
  // The entire template stays inside the existing 90 × 100 hit target.
  g.ellipse(5, 27, 40, 12).fill({ color: 0x102d28, alpha: 0.25 })
  g.ellipse(0, 25, 35, 10).fill(0x6f866a)
  g.ellipse(-2, 23, 31, 7).fill(0x9fa98a)
  if (kind !== 'boulder') {
    g.roundRect(-34, 20, 68, 10, 4).fill(p.side)
    g.roundRect(-34, 19, 65, 6, 3).fill(p.face)
    g.moveTo(-30, 20).lineTo(27, 20).stroke({ color: p.edge, width: 1, alpha: 0.6 })
  }
  g.translate(3, 4)
  silhouette(g, kind).fill(p.side)
  g.resetTransform()
  silhouette(g, kind).fill(p.face).stroke({ color: p.edge, width: 0.8, alpha: 0.7 })

  if (kind === 'arch') {
    g.moveTo(-20, 16).lineTo(-20, -13).bezierCurveTo(-20, -40, 20, -40, 20, -13).lineTo(20, 16)
      .stroke({ color: 0x9da88a, width: 1, alpha: 0.8 })
    g.moveTo(-22, -10).quadraticCurveTo(-21, -32, -5, -35).stroke({ color: p.edge, width: 2, alpha: 0.7 })
    paw(g, -1, p.engraving)
    g.moveTo(-9, 12).quadraticCurveTo(0, 14, 9, 12).stroke({ color: p.engraving, width: 1, alpha: 0.45 })
  } else if (kind === 'tablet') {
    g.roundRect(-25, -25, 50, 41, 5).stroke({ color: p.engraving, width: 1, alpha: 0.5 })
    g.moveTo(-26, -27).lineTo(22, -27).stroke({ color: p.edge, width: 2, alpha: 0.8 })
    paw(g, -3, p.engraving)
    // A small branch carved below the paw.
    g.moveTo(-10, 10).quadraticCurveTo(0, 14, 11, 8).stroke({ color: p.engraving, width: 1, alpha: 0.65 })
    g.ellipse(-5, 10, 2.6, 1.1).ellipse(4, 10, 2.5, 1.1).fill({ color: p.engraving, alpha: 0.6 })
  } else if (kind === 'stele') {
    g.moveTo(-20, -16).lineTo(0, -36).lineTo(20, -16).lineTo(17, 15).lineTo(-17, 15).closePath()
      .stroke({ color: p.engraving, width: 1, alpha: 0.5 })
    g.moveTo(-25, -18).lineTo(0, -42).lineTo(0, -36).lineTo(-20, -16).closePath().fill({ color: p.edge, alpha: 0.7 })
    paw(g, -1, p.engraving)
    g.moveTo(-8, 11).lineTo(8, 11).stroke({ color: p.engraving, width: 1, alpha: 0.45 })
  } else {
    g.moveTo(-29, -9).quadraticCurveTo(-27, -28, -12, -27).quadraticCurveTo(-1, -35, 12, -27)
      .stroke({ color: p.edge, width: 2, alpha: 0.7 })
    g.moveTo(25, -15).lineTo(21, -8).lineTo(24, -3).stroke({ color: p.engraving, width: 1, alpha: 0.35 })
    g.ellipse(0, -2, 22, 20).fill({ color: p.edge, alpha: 0.12 })
    paw(g, 3, p.engraving)
    g.moveTo(-8, 16).quadraticCurveTo(0, 18, 8, 15).stroke({ color: p.engraving, width: 1, alpha: 0.4 })
  }
  // Bounded, deterministic mineral flecks: drawn once, outside the central carving.
  for (let i = 0; i < 9; i++) {
    const x = (i % 2 ? -1 : 1) * (15 + i % 3 * 3)
    const y = -19 + (i * 13 % 35)
    g.ellipse(x, y, i % 3 ? 0.9 : 1.6, 0.7).fill({ color: i % 2 ? p.edge : p.engraving, alpha: 0.25 })
  }
  moss(g, kind)
  return g
}

// Lazy, scene-owned geometry: at most four contexts, shared by all matching markers.
// Destroy the whole scene with { children: true, context: true }; never share across scenes.
export function createMonumentArt() {
  const contexts = new Map<MonumentKind, GraphicsContext>()
  return (kind: MonumentKind) => {
    let context = contexts.get(kind)
    if (!context) {
      context = drawMonument(kind)
      contexts.set(kind, context)
    }
    const graphic = new Graphics({ context })
    graphic.eventMode = 'none'
    return graphic
  }
}
