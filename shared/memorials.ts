import { z } from 'zod'
import { gardenIds, isCreatablePlace } from './gardens'
import type { GardenId } from './gardens'

export function memorialSchema(message: (key: string) => string = key => key) {
  const year = () => z.coerce.number({ error: message('year') }).int(message('year')).min(1900, message('year')).max(new Date().getUTCFullYear(), message('year'))
  return z.object({
    name: z.string().trim().min(1, message('name')).max(80, message('nameLimit')),
    born: year(),
    died: year(),
    story: z.string().trim().min(1, message('story')).max(5000, message('storyLimit')),
    isAnonymous: z.boolean().default(false),
    gardenId: z.enum(gardenIds, { error: message('garden') }),
    place: z.number({ error: message('place') }).int(message('place')).optional(),
    requestId: z.uuid()
  }).strict()
    .refine(value => value.born <= value.died, { path: ['died'], message: message('order') })
    .refine(value => value.place === undefined || isCreatablePlace(value.gardenId, value.place), { path: ['place'], message: message('place') })
}

export type NewMemorial = z.output<ReturnType<typeof memorialSchema>>
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
  species: 'pet'
}
