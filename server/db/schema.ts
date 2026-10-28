import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { userRoles } from '../../shared/roles'
import { petSpecies } from '../../shared/pet-species'

export const gardens = pgTable('gardens', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const user = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  surname: text('surname').default('').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: text('role', { enum: userRoles }).default('user').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, table => [check('auth_user_role_check', sql`${table.role} in ('user', 'admin')`)])

export const session = pgTable('auth_session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
}, table => [index('auth_session_user_idx').on(table.userId)])

export const account = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, table => [index('auth_account_user_idx').on(table.userId)])

export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, table => [index('auth_verification_identifier_idx').on(table.identifier)])

export const rateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull()
}, table => [index('auth_rate_limit_last_request_idx').on(table.lastRequest)])

export const memorials = pgTable('memorials', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  gardenId: uuid('garden_id').notNull().references(() => gardens.id, { onDelete: 'restrict' }),
  place: integer('place').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  species: text('species', { enum: petSpecies }).default('pet').notNull(),
  born: integer('born').notNull(),
  died: integer('died').notNull(),
  story: text('story').notNull(),
  isAnonymous: boolean('is_anonymous').default(false).notNull(),
  requestId: uuid('request_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, table => [
  uniqueIndex('memorials_garden_place_unique').on(table.gardenId, table.place),
  uniqueIndex('memorials_owner_request_unique').on(table.ownerId, table.requestId),
  index('memorials_owner_idx').on(table.ownerId),
  check('memorials_years_check', sql`${table.born} >= 1900 AND ${table.born} <= ${table.died}`),
  check('memorials_place_check', sql`${table.place} > 0`),
  check('memorials_name_check', sql`length(trim(${table.name})) BETWEEN 1 AND 80`),
  check('memorials_story_check', sql`length(trim(${table.story})) BETWEEN 1 AND 5000`),
  check('memorials_species_check', sql`${table.species} in ('dog', 'cat', 'rabbit', 'hamster', 'guineaPig', 'rat', 'mouse', 'chinchilla', 'ferret', 'hedgehog', 'bird', 'parrot', 'fish', 'turtle', 'snake', 'lizard', 'frog', 'axolotl', 'spider', 'snail', 'pet')`)
])
