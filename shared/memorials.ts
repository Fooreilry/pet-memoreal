import { z } from 'zod'
import { gardenIds, isCreatablePlace } from './gardens'
import type { GardenId } from './gardens'
import { petSpecies } from './pet-species'
import type { PetSpecies } from './pet-species'

function memorialFields(message: (key: string) => string) {
  const year = () => z.coerce.number({ error: message('year') }).int(message('year')).min(1900, message('year')).max(new Date().getUTCFullYear(), message('year'))
  return {
    name: z.string().trim().min(1, message('name')).max(80, message('nameLimit')),
    species: z.enum(petSpecies, { error: message('species') }),
    born: year(),
    died: year(),
    story: z.string().trim().min(1, message('story')).max(5000, message('storyLimit'))
  }
}

export function memorialSchema(message: (key: string) => string = key => key) {
  return z.object({
    ...memorialFields(message),
    isAnonymous: z.boolean().default(false),
    gardenId: z.enum(gardenIds, { error: message('garden') }),
    place: z.number({ error: message('place') }).int(message('place')).optional(),
    requestId: z.uuid()
  }).strict()
    .refine(value => value.born <= value.died, { path: ['died'], message: message('order') })
    .refine(value => value.place === undefined || isCreatablePlace(value.gardenId, value.place), { path: ['place'], message: message('place') })
}

export function memorialUpdateSchema(message: (key: string) => string = key => key) {
  return z.object({ ...memorialFields(message), isAnonymous: z.boolean() }).strict()
    .refine(value => value.born <= value.died, { path: ['died'], message: message('order') })
}

export type NewMemorial = z.output<ReturnType<typeof memorialSchema>>
export type MemorialUpdate = z.output<ReturnType<typeof memorialUpdateSchema>>
export type PublicMemorial = {
  source: 'saved'
  id: string
  gardenId: GardenId
  place: number
  name: string
  born: number
  died: number
  story: string
  creatorName: string | null
  species: PetSpecies
  canEdit?: boolean
}

export type EditableMemorial = PublicMemorial & { isAnonymous: boolean }
