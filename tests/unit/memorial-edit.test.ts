import assert from 'node:assert/strict'
import test from 'node:test'
import { memorialSchema, memorialUpdateSchema } from '../../shared/memorials'

const editable = { name: '  Lilo  ', species: 'cat', born: 2010, died: 2024, story: '  A treasured memory.  ', isAnonymous: true }

test('editing validates complete content with the same year and text rules as creation', () => {
  const update = memorialUpdateSchema()
  assert.deepEqual(update.parse(editable), { ...editable, name: 'Lilo', story: 'A treasured memory.' })
  for (const input of [
    { ...editable, name: ' ' }, { ...editable, name: 'a'.repeat(81) }, { ...editable, story: '' },
    { ...editable, story: 'a'.repeat(5001) }, { ...editable, born: 1899 }, { ...editable, born: 2025 },
    { ...editable, died: new Date().getUTCFullYear() + 1 }, { ...editable, died: 2024.5 },
    { ...editable, isAnonymous: 'true' }
  ]) assert.equal(update.safeParse(input).success, false)
  const parsed = memorialSchema().parse({ ...editable, gardenId: 'meadow', place: 3, requestId: 'a48f3cbc-dcc5-4e63-9d19-2236ad6bd52b' })
  assert.deepEqual(update.parse({ name: parsed.name, species: parsed.species, born: parsed.born, died: parsed.died, story: parsed.story, isAnonymous: parsed.isAnonymous }), update.parse(editable))
})

test('editing rejects missing fields and attempts to change placement, ownership or creation identifiers', () => {
  const schema = memorialUpdateSchema()
  for (const field of ['gardenId', 'place', 'ownerId', 'id', 'requestId', 'createdAt', 'canEdit']) {
    assert.equal(schema.safeParse({ ...editable, [field]: 'tampered' }).success, false, field)
  }
  for (const field of Object.keys(editable)) {
    const input = Object.fromEntries(Object.entries(editable).filter(([key]) => key !== field))
    assert.equal(schema.safeParse(input).success, false, field)
  }
})
