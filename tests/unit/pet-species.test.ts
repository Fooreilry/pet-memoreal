import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { petSpecies } from '../../shared/pet-species'
import { memorialSchema, memorialUpdateSchema } from '../../shared/memorials'
import { petSpeciesIcons } from '../../app/data/petSpeciesIcons'

const content = { name: 'Friend', born: 2010, died: 2024, story: 'A sunny memory.', isAnonymous: false }

test('creation and editing accept the same domestic and exotic animals and reject unsupported or missing values', () => {
  const create = memorialSchema(), update = memorialUpdateSchema()
  const placement = { gardenId: 'meadow', place: 3, requestId: '4eaf2d68-0f4d-46f4-ae68-376aa38f23b9' }
  for (const species of petSpecies) {
    assert.equal(create.parse({ ...content, ...placement, species }).species, species)
    assert.equal(update.parse({ ...content, species }).species, species)
  }
  for (const species of [undefined, null, '', 'dragon', 'CAT', ['cat'], { species: 'cat' }, 1]) {
    assert.equal(create.safeParse({ ...content, ...placement, species }).success, false)
    assert.equal(update.safeParse({ ...content, species }).success, false)
  }
})

test('every offered animal has its own bundled icon and Russian and English labels', async () => {
  const en = JSON.parse(await readFile(new URL('../../i18n/locales/en.json', import.meta.url), 'utf8'))
  const ru = JSON.parse(await readFile(new URL('../../i18n/locales/ru.json', import.meta.url), 'utf8'))
  const signatures = new Set<string>()
  for (const species of petSpecies) {
    assert.ok(en.memorial.species[species], `English label for ${species}`)
    assert.ok(ru.memorial.species[species], `Russian label for ${species}`)
    const drawing = petSpeciesIcons[species]
    assert.ok(drawing)
    if ('paths' in drawing) assert.ok(drawing.paths.length && drawing.paths.every(path => path.length > 0))
    const signature = JSON.stringify(drawing)
    assert.ok(!signatures.has(signature), `Distinct icon for ${species}`)
    signatures.add(signature)
  }
})
