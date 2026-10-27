import assert from 'node:assert/strict'
import test from 'node:test'
import { getHillWindLayout } from '../../app/data/hillLife'
import { getHillSceneryLayout } from '../../app/data/hillScenery'
import { getGardenPlantLayout } from '../../app/data/gardenPlants'
import { createGardenPlacement, sceneryBounds, sceneryIntersects } from '../../app/data/gardenPlacement'

test('windblown hill grass has stable sparse roots and reserves its entire bending envelope', () => {
  for (const [width, height] of [[1200, 1000], [640, 840], [1900, 650]]) {
    const tufts = getHillWindLayout(width!, height!)
    assert.deepEqual(getHillWindLayout(width!, height!), tufts)
    assert.ok(tufts.length > 0 && tufts.length <= 12)
    const accents = getGardenPlantLayout(width!, height!, 'hill').map(plant =>
      sceneryBounds(plant.x, plant.y, plant.size * 1.3, plant.size * 1.6, plant.size * 0.45))
    const occupied = [...getHillSceneryLayout(width!, height!).occupied, ...accents]
    const obstacles = createGardenPlacement(width!, height!, 'hill', false, occupied).obstacles
    const envelopes = tufts.map(tuft => sceneryBounds(tuft.x, tuft.y, tuft.size + 6, tuft.size + 2, 5))
    for (const [index, envelope] of envelopes.entries()) {
      assert.ok(envelope.left >= 8 && envelope.right <= width! - 8 && envelope.top >= 8 && envelope.bottom <= height! - 8)
      for (const obstacle of obstacles) assert.equal(sceneryIntersects(envelope, obstacle), false)
      for (const other of envelopes.slice(index + 1)) assert.equal(sceneryIntersects(envelope, other), false)
      assert.ok(tufts[index]!.size >= 20 && tufts[index]!.size <= 26)
    }
  }
})
