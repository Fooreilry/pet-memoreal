import { Container, Graphics } from 'pixi.js'
import { getMeadowInsectLayout } from '../data/meadowLife'

// All seven insects share the scene ticker; only transforms change after creation.
export function createMeadowAmbience(parent: Container, width: number, height: number) {
  const layout = getMeadowInsectLayout(width, height)
  const butterflies = layout.butterflies.map((flight, index) => {
    const insect = new Container()
    insect.eventMode = 'none'
    const wings = new Graphics()
    for (const side of [-1, 1]) {
      wings.moveTo(0, 0).bezierCurveTo(side * 4, -11, side * 12, -9, side * 8, -1).quadraticCurveTo(side * 5, 4, 0, 1).fill(index % 2 ? 0xe0c6b1 : 0xf0dfb5)
      wings.moveTo(0, 1).quadraticCurveTo(side * 10, 0, side * 5, 7).quadraticCurveTo(side, 9, 0, 1).fill(0xb8bd98)
      wings.circle(side * 6, -4, 1.2).fill({ color: 0x7e8768, alpha: 0.5 })
    }
    insect.addChild(wings)
    insect.addChild(new Graphics().moveTo(0, -4).lineTo(0, 5).stroke({ color: 0x485c46, width: 1.5 }))
    insect.alpha = 0.85
    parent.addChild(insect)
    return { insect, wings, flight }
  })
  const bees = layout.bees.map(flight => {
    const insect = new Container()
    insect.eventMode = 'none'
    const wings = new Graphics()
    wings.ellipse(-1.4, -3.2, 3.8, 2).ellipse(2.2, -3.4, 3.4, 1.8).fill({ color: 0xe6eddb, alpha: 0.58 })
    wings.moveTo(-3.5, -3).lineTo(0, -1).moveTo(3.8, -3.8).lineTo(1, -1).stroke({ color: 0xf5f0d4, width: 0.55, alpha: 0.6 })
    const body = new Graphics()
    body.ellipse(-0.4, 0, 4.4, 2.7).fill(0xcba45c)
    body.ellipse(-1.1, -0.8, 3.2, 1).fill({ color: 0xf0d28a, alpha: 0.75 })
    for (const x of [-2, 0.3]) body.moveTo(x, -2.5).quadraticCurveTo(x + 1, 0, x, 2.5).stroke({ color: 0x4c5038, width: 1.25 })
    body.circle(4, -0.2, 2).fill(0x48503a)
    body.circle(4.7, -0.8, 0.55).fill(0xdcd8ae)
    body.moveTo(4.3, -1.6).quadraticCurveTo(5.1, -3.6, 6.4, -3.3)
      .moveTo(5, -1.1).quadraticCurveTo(6.4, -2.3, 7, -1.7).stroke({ color: 0x4c5038, width: 0.65 })
    body.moveTo(-1.4, 2).lineTo(-2.5, 3.8).moveTo(1, 2).lineTo(1.8, 3.7).stroke({ color: 0x526044, width: 0.65 })
    insect.addChild(wings, body)
    insect.alpha = 0.9
    parent.addChild(insect)
    return { insect, wings, flight }
  })
  return (time: number) => {
    for (const { insect, wings, flight: { x, y, rx, ry, phase } } of butterflies) {
      insect.position.set(x + Math.sin(time * 0.24 + phase) * rx, y + Math.sin(time * 0.37 + phase) * ry)
      insect.rotation = Math.sin(time * 0.3 + phase) * 0.22
      wings.scale.x = 0.45 + (Math.sin(time * 2.8 + phase) + 1) * 0.275
    }
    for (const { insect, wings, flight: { x, y, rx, ry, phase } } of bees) {
      // The eased drift slows above each flower; the tiny bob remains gentle.
      const drift = Math.sin(time * 0.19 + phase)
      insect.position.set(x + drift * drift * drift * rx, y + Math.sin(time * 0.27 + phase) * ry + Math.sin(time * 0.83 + phase) * 1.3)
      insect.rotation = Math.sin(time * 0.22 + phase) * 0.16
      wings.scale.y = 0.65 + (Math.sin(time * 17 + phase) + 1) * 0.175
    }
  }
}
