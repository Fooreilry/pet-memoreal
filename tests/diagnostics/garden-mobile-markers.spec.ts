import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Application, Graphics, Text } from 'pixi.js'
import type { GardenDiagnosticsSnapshot } from '../../app/utils/gardenDiagnostics'
import { gardenCapacity, gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { localeCookieName } from '../../shared/locale'
import { enterGarden } from './helpers'

type Runtime = Window & {
  markerTestApp?: Application
  __gardenDiagnostics?: {
    ready: () => boolean
    camera: (view: { zoom: number, x: number, y: number }) => void
    navigateGarden: (id: GardenId) => Promise<void>
    beginRun: (scenario: string) => string
    snapshot: () => GardenDiagnosticsSnapshot
  }
}
const origin = 'http://127.0.0.1:4180'
const savedId = '8bca0797-5d6c-4b68-b243-9c41c7fe0203'
const longName = 'Mishka — a much loved companion with a very long memorial name'

async function visit(page: Page, options: { fullGrove?: boolean } = {}) {
  await page.context().addCookies([
    { name: localeCookieName, value: 'en', url: origin },
    { name: 'petmemoreal_garden_session', value: '424242', url: origin }
  ])
  await page.addInitScript(() => {
    // Inspect real Pixi artwork on its existing renderer. This hook is confined
    // to the browser test; the production component exposes no test API.
    window.__PIXI_APP_INIT__ = (app) => {
      if ('stage' in app) (window as Runtime).markerTestApp = app
    }
  })
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (path === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } })
    if (path === '/api/auth/get-session') return route.fulfill({ json: null })
    const garden = path.match(/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/)?.[1]
    if (garden) {
      const places = options.fullGrove && garden === 'grove' ? Array.from({ length: 16 }, (_, index) => index + 1) : [3]
      return route.fulfill({ json: places.map(place => ({ source: 'saved', id: place === 3 ? savedId : `00000000-0000-0000-0000-${String(place).padStart(12, '0')}`, gardenId: garden, place, name: place === 3 ? longName : ['Milo', 'Luna', 'Oscar', 'Bella'][(place - 1) % 4], species: 'cat', born: 2010, died: 2024, story: 'A remembered companion.', creatorName: null, canEdit: false })) })
    }
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected mobile marker fixture request' } })
  })
  await enterGarden(page, `${origin}/gardens?garden=meadow&diagnosticsMode=collect`)
  await ready(page, 'meadow')
}

async function ready(page: Page, garden: GardenId) {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics?.ready())).toBe(true)
}

async function camera(page: Page, zoom: number) {
  await page.evaluate(value => (window as Runtime).__gardenDiagnostics!.camera({ zoom: value, x: 0, y: 0 }), zoom)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', zoom.toFixed(3))
  // The camera applies artwork sizing and the accessible DOM overlay together.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const app = (window as Runtime).markerTestApp!
    const canvas = app.canvas.getBoundingClientRect()
    const ratio = canvas.width / app.renderer.screen.width
    const rect = (node: ReturnType<Application['stage']['getChildByLabel']>) => {
      const bounds = node!.getBounds()
      return { left: canvas.left + bounds.minX * ratio, top: canvas.top + bounds.minY * ratio, right: canvas.left + bounds.maxX * ratio, bottom: canvas.top + bounds.maxY * ratio }
    }
    const markers = Array.from(document.querySelectorAll<HTMLElement>('.memorial-position')).map((position) => {
      const chunk = position.dataset.chunkId!
      const place = chunk.split('place-')[1]!
      const occupied = !!position.querySelector('[data-monument-kind]')
      const visual = app.stage.getChildByLabel(`${occupied ? 'memorial' : 'empty-place'}-visual-${place}`, true)!
      const name = occupied ? app.stage.getChildByLabel(`memorial-name-${place}`, true) as Text : undefined
      const hit = position.querySelector('button')!.getBoundingClientRect()
      const art = rect(visual)
      const caption = name ? rect(name) : undefined
      const picked = document.elementFromPoint((art.left + art.right) / 2, (art.top + art.bottom) / 2)?.closest<HTMLElement>('.memorial-position')
      return {
        chunk, occupied, x: position.dataset.worldX, y: position.dataset.worldY,
        anchor: { x: visual.x, y: visual.y }, scale: visual.scale.x, art,
        fontPx: name ? Number(name.style.fontSize) * Math.hypot(name.worldTransform.a, name.worldTransform.b) * ratio : undefined,
        caption, pickedChunk: picked?.dataset.chunkId,
        hit: { left: hit.left, top: hit.top, right: hit.right, bottom: hit.bottom, width: hit.width, height: hit.height }
      }
    })
    const instructions: { uid: number, count: number }[] = []
    const stack = [app.stage]
    while (stack.length) {
      const node = stack.pop()!
      if ('context' in node) {
        const graphic = node as Graphics
        instructions.push({ uid: graphic.context.uid, count: graphic.context.instructions.length })
      }
      stack.push(...node.children)
    }
    return { markers, instructions }
  })
}

function aligned(snapshot: Awaited<ReturnType<typeof geometry>>, garden: GardenId, compact: boolean, minimumFont = 12) {
  expect(snapshot.markers).toHaveLength(gardenCapacity[garden])
  for (const marker of snapshot.markers) {
    expect(marker.hit.width).toBeGreaterThanOrEqual(43.9)
    expect(marker.hit.height).toBeGreaterThanOrEqual(43.9)
    expect(marker.pickedChunk, `${marker.chunk} must receive a tap on its visible centre: ${JSON.stringify({ marker, interceptedBy: snapshot.markers.find(other => other.chunk === marker.pickedChunk) })}`).toBe(marker.chunk)
    for (const bounds of [marker.art, compact ? marker.caption : undefined].filter(value => !!value)) {
      expect(bounds.left, `${marker.chunk} extends left of its target`).toBeGreaterThanOrEqual(marker.hit.left - 1)
      expect(bounds.right, `${marker.chunk} extends right of its target`).toBeLessThanOrEqual(marker.hit.right + 1)
      expect(bounds.top, `${marker.chunk} extends above its target`).toBeGreaterThanOrEqual(marker.hit.top - 1)
      expect(bounds.bottom, `${marker.chunk} extends below its target`).toBeLessThanOrEqual(marker.hit.bottom + 1)
    }
    if (compact) {
      expect(marker.scale).toBeGreaterThan(1)
      if (marker.occupied) expect(marker.fontPx).toBeGreaterThanOrEqual(minimumFont - .1)
    } else expect(marker.scale).toBe(1)
  }
  for (let index = 0; index < snapshot.markers.length; index++) {
    const a = snapshot.markers[index]!
    for (const b of snapshot.markers.slice(index + 1)) {
      // The pre-existing 44px invisible targets can overlap by a pixel or two
      // on a 320px viewport. Visible enlarged stones must remain separate.
      const width = Math.min(a.art.right, b.art.right) - Math.max(a.art.left, b.art.left)
      const height = Math.min(a.art.bottom, b.art.bottom) - Math.max(a.art.top, b.art.top)
      expect(width <= .5 || height <= .5, `${a.chunk} and ${b.chunk} have overlapping marker artwork`).toBe(true)
    }
  }
}

test.describe('touch devices', () => {
  test.use({ isMobile: true, hasTouch: true })

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    test(`mobile markers stay readable and tappable at whole-map zoom (${viewport.width}px)`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await visit(page)
      for (const garden of gardenIds) {
        await page.evaluate(id => (window as Runtime).__gardenDiagnostics!.navigateGarden(id), garden)
        await ready(page, garden)
        await camera(page, 1)
        const whole = await geometry(page)
        await page.screenshot({ path: testInfo.outputPath(`${garden}-${viewport.width}.png`), animations: 'disabled', scale: 'css' })
        aligned(whole, garden, true, viewport.width >= 390 ? 14 : 12)
        await expect(page.getByTestId(`memorial-${savedId}`)).toHaveAttribute('aria-label', new RegExp(longName))

        const beforeClick = await page.locator('.canvas-wrapper').evaluate(element => {
          const data = (element as HTMLElement).dataset
          return { zoom: data.zoom, x: data.cameraX, y: data.cameraY }
        })
        await page.getByTestId(`memorial-${garden}-1`).tap()
        await expect(page.getByTestId('memorial-summary')).toBeVisible()
        expect(await page.locator('.canvas-wrapper').evaluate(element => {
          const data = (element as HTMLElement).dataset
          return { zoom: data.zoom, x: data.cameraX, y: data.cameraY }
        })).toEqual(beforeClick)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('memorial-summary')).toHaveCount(0)

        await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('mobile-marker-camera'))
        await camera(page, 2)
        const closer = await geometry(page)
        expect(closer.instructions).toEqual(whole.instructions)
        expect((await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.snapshot())).counts.generations).toBe(0)
        for (const [index, marker] of closer.markers.entries()) {
          const before = whole.markers[index]!
          expect({ x: marker.x, y: marker.y, anchor: marker.anchor }).toEqual({ x: before.x, y: before.y, anchor: before.anchor })
          expect(marker.scale).toBeLessThanOrEqual(before.scale)
          expect(marker.art.right - marker.art.left).toBeGreaterThanOrEqual(before.art.right - before.art.left - .1)
        }
      }
    })
  }

  test('phone landscape also uses readable markers without changing the world', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit(page)
    await camera(page, 1)
    aligned(await geometry(page), 'meadow', true)
    await page.getByTestId('memorial-meadow-1').tap()
    await expect(page.getByTestId('memorial-summary')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('meadow-phone-landscape.png'), animations: 'disabled', scale: 'css' })
  })

  test('a fully occupied grove keeps all names readable and targets unambiguous at 320px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit(page, { fullGrove: true })
    await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.navigateGarden('grove'))
    await ready(page, 'grove')
    await camera(page, 1)
    const full = await geometry(page)
    await page.screenshot({ path: testInfo.outputPath('fully-occupied-grove-320.png'), animations: 'disabled', scale: 'css' })
    expect(full.markers.filter(marker => marker.occupied)).toHaveLength(16)
    aligned(full, 'grove', true)
    for (const a of full.markers) {
      for (const b of full.markers) {
        if (a.chunk === b.chunk) continue
        // A compact nameplate can sit on its own stone; it must never obscure
        // a neighbour's stone or compete with another readable name.
        for (const bounds of [b.art, b.caption!]) {
          const width = Math.min(a.caption!.right, bounds.right) - Math.max(a.caption!.left, bounds.left)
          const height = Math.min(a.caption!.bottom, bounds.bottom) - Math.max(a.caption!.top, bounds.top)
          expect(width <= .5 || height <= .5, `${a.chunk} name overlaps ${b.chunk}: ${JSON.stringify({ caption: a.caption, bounds })}`).toBe(true)
        }
      }
    }
    await expect(page.getByTestId(`memorial-${savedId}`)).toHaveAttribute('aria-label', new RegExp(longName))
  })
})

test('desktop artwork keeps its scale and resizing preserves each permanent place', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visit(page)
  await camera(page, 1)
  const desktop = await geometry(page)
  aligned(desktop, 'meadow', false)
  const anchors = desktop.markers.map(({ chunk, x, y, anchor }) => ({ chunk, x, y, anchor }))
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await ready(page, 'meadow')
    await camera(page, 1)
    const resized = await geometry(page)
    expect(resized.markers.map(({ chunk, x, y, anchor }) => ({ chunk, x, y, anchor }))).toEqual(anchors)
    // Narrow landscape may use desktop controls on a mouse device, but geometry
    // and accessible targets must still match the same projected world.
    for (const marker of resized.markers) {
      expect(marker.hit.width).toBeGreaterThanOrEqual(43.9)
      expect(marker.hit.height).toBeGreaterThanOrEqual(43.9)
    }
    await page.screenshot({ path: testInfo.outputPath(`resized-${viewport.width}.png`), animations: 'disabled', scale: 'css' })
  }
})
