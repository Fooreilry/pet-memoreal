import { getMemorialLayout } from './demoMemorials'

export type MeadowFlight = { x: number, y: number, rx: number, ry: number, phase: number }

// Keep the whole flight envelope at the flowered edges, away from stones and names.
export function getMeadowInsectLayout(width: number, height: number) {
  const { places } = getMemorialLayout(width, height, 'meadow')
  function clear(flight: MeadowFlight, radius: number) {
    const left = flight.x - flight.rx - radius
    const right = flight.x + flight.rx + radius
    const top = flight.y - flight.ry - radius
    const bottom = flight.y + flight.ry + radius
    return left >= 8 && right <= width - 8 && top >= 8 && bottom <= height - 8
      && !places.some(place => right > place.x - 65 && left < place.x + 65 && bottom > place.y - 52 && top < place.y + 65)
  }
  const butterflies: MeadowFlight[] = [
    { x: width * 0.22, y: 54, rx: 23, ry: 10, phase: 0 },
    { x: width * 0.62, y: height - 44, rx: 23, ry: 10, phase: 1.9 },
    { x: 33, y: height * 0.38, rx: 10, ry: 17, phase: 3.8 },
    { x: width - 33, y: height * 0.72, rx: 10, ry: 17, phase: 5.7 }
  ]
  const bees: MeadowFlight[] = [
    { x: width * 0.44, y: 45, rx: 24, ry: 5, phase: 0.9 },
    { x: width * 0.3, y: height - 52, rx: 24, ry: 7, phase: 3.4 },
    { x: width - 34, y: height * 0.5, rx: 9, ry: 18, phase: 5.5 }
  ]
  return {
    butterflies: butterflies.filter(flight => clear(flight, 15)),
    bees: bees.filter(flight => clear(flight, 11))
  }
}
