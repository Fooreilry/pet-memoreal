import type { GardenId } from './gardens'
import type { PetSpecies } from './pet-species'
import type { Permissions, UserRole } from './roles'

export type AdminOverview = {
  users: { id: string, name: string, surname: string, email: string, role: UserRole, emailVerified: boolean, createdAt: string }[]
  memorials: { id: string, gardenId: GardenId, place: number, name: string, species: PetSpecies, born: number, died: number, story: string, isAnonymous: boolean, ownerId: string, creatorName: string | null }[]
  gardens: { id: GardenId, capacity: number, occupied: number }[]
  totals: { users: number, memorials: number }
  pageSize: number
  usersPage: number
  memorialsPage: number
  permissions: Permissions
}
