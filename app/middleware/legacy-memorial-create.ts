import { gardenIds, isCreatablePlace } from '#shared/gardens'

export default defineNuxtRouteMiddleware((to) => {
  const garden = gardenIds.find(id => id === to.query.garden)
  const place = typeof to.query.create === 'string' ? Number(to.query.create) : NaN
  if (!garden || !isCreatablePlace(garden, place)) return
  return navigateTo({ path: useLocalePath()('/memorials/new'), query: { garden, place } }, { replace: true, redirectCode: 302 })
})
