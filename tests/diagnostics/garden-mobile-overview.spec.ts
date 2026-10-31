import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Application } from 'pixi.js'
import { gardenIds } from '../../shared/gardens'
import { localeCookieName } from '../../shared/locale'
import { enterGarden } from './helpers'

type Runtime = Window & {
  overviewTestApp?: Application
  heldOverviewReveal?: Promise<{ committed: boolean }>
  releaseOverviewRevealClock?: () => void
}
const origin = 'http://127.0.0.1:4180'

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await page.screenshot({ path: testInfo.outputPath('overview-failure.png'), animations: 'disabled', scale: 'css' })
  }
})

async function visit(page: Page, locale: 'ru' | 'en') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([
    { name: localeCookieName, value: locale, url: origin },
    { name: 'petmemoreal_garden_session', value: '424242', url: origin }
  ])
  await page.addInitScript(() => {
    // Observe the real single renderer, without adding production-only APIs.
    window.__PIXI_APP_INIT__ = app => {
      if ('stage' in app) (window as Runtime).overviewTestApp = app
    }
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (path === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401 } })
    if (path === '/api/auth/get-session') return route.fulfill({ json: null })
    if (/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/.test(path)) return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected overview fixture request' } })
  })
  await enterGarden(page, `${origin}/gardens`)
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

async function ready(page: Page, garden = 'overview') {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(page.locator('canvas')).toHaveCount(1)
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const app = (window as Runtime).overviewTestApp!
    const canvas = app.canvas.getBoundingClientRect()
    const ratio = canvas.width / app.renderer.screen.width
    const rect = (value: DOMRect) => ({ left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height })
    const worldRect = (value: { minX: number, minY: number, maxX: number, maxY: number }) => ({
      left: canvas.left + value.minX * ratio, top: canvas.top + value.minY * ratio,
      right: canvas.left + value.maxX * ratio, bottom: canvas.top + value.maxY * ratio,
      width: (value.maxX - value.minX) * ratio, height: (value.maxY - value.minY) * ratio
    })
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      cards: Array.from(document.querySelectorAll<HTMLButtonElement>('.garden-choice')).map(button => {
        const id = button.dataset.testid!.replace('garden-choice-', '')
        const illustration = button.querySelector<HTMLElement>('.garden-choice-illustration')
        const caption = button.querySelector<HTMLElement>('.garden-choice-caption')!
        const title = button.querySelector<HTMLElement>('.garden-choice-title')!
        const description = button.querySelector<HTMLElement>('.garden-choice-description')!
        const image = app.stage.getChildByLabel(`overview-image-${id}`, true)
        const scenery = app.stage.getChildByLabel(`overview-scenery-${id}`, true)
        const imageBounds = image?.getBounds()
        const sourceBounds = scenery?.getLocalBounds()
        const bounds = button.getBoundingClientRect()
        const picked = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest<HTMLButtonElement>('.garden-choice')
        return {
          id, card: rect(bounds), illustration: illustration ? rect(illustration.getBoundingClientRect()) : undefined,
          caption: rect(caption.getBoundingClientRect()), title: rect(title.getBoundingClientRect()), description: rect(description.getBoundingClientRect()),
          titleFont: parseFloat(getComputedStyle(title).fontSize), descriptionFont: parseFloat(getComputedStyle(description).fontSize),
          titleOverflow: title.scrollHeight - title.clientHeight, descriptionOverflow: description.scrollHeight - description.clientHeight,
          picked: picked?.dataset.testid, image: imageBounds ? worldRect(imageBounds) : undefined,
          scales: scenery ? { x: scenery.scale.x, y: scenery.scale.y } : undefined,
          source: sourceBounds ? { left: sourceBounds.minX, top: sourceBounds.minY, right: sourceBounds.maxX, bottom: sourceBounds.maxY } : undefined
        }
      })
    }
  })
}

function compactLayout(snapshot: Awaited<ReturnType<typeof geometry>>) {
  expect(snapshot.cards.map(card => card.id)).toEqual(gardenIds)
  expect(snapshot.document.width).toBeLessThanOrEqual(snapshot.viewport.width + 1)
  expect(snapshot.document.height).toBeLessThanOrEqual(snapshot.viewport.height + 1)
  for (const card of snapshot.cards) {
    expect(card.card.width).toBeGreaterThanOrEqual(44)
    expect(card.card.height).toBeGreaterThanOrEqual(44)
    expect(card.card.left).toBeGreaterThanOrEqual(0)
    expect(card.card.top).toBeGreaterThanOrEqual(0)
    expect(card.card.right).toBeLessThanOrEqual(snapshot.viewport.width + .5)
    expect(card.card.bottom).toBeLessThanOrEqual(snapshot.viewport.height + .5)
    expect(card.picked).toBe(`garden-choice-${card.id}`)
    expect(card.illustration).toBeDefined()
    expect(card.image).toBeDefined()
    expect(card.scales).toBeDefined()
    const art = card.illustration!
    expect(art.width / art.height).toBeCloseTo(4 / 3, 2)
    expect(card.scales!.x).toBeCloseTo(card.scales!.y, 8)
    expect(card.scales!.x).toBeCloseTo(art.width / 320, 3)
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(card.image![edge]).toBeCloseTo(art[edge], 0)
    }
    expect(card.caption.top).toBeGreaterThanOrEqual(art.bottom - 1)
    for (const element of [art, card.caption, card.title, card.description]) {
      expect(element.left).toBeGreaterThanOrEqual(card.card.left - 1)
      expect(element.right).toBeLessThanOrEqual(card.card.right + 1)
      expect(element.top).toBeGreaterThanOrEqual(card.card.top - 1)
      expect(element.bottom).toBeLessThanOrEqual(card.card.bottom + 1)
    }
    expect(card.titleFont).toBeGreaterThanOrEqual(18)
    expect(card.descriptionFont).toBeGreaterThanOrEqual(12)
    expect(card.titleOverflow).toBeLessThanOrEqual(1)
    expect(card.descriptionOverflow).toBeLessThanOrEqual(1)
  }
  const [first, second, third, fourth] = snapshot.cards
  expect(first!.card.top).toBeCloseTo(second!.card.top, 1)
  expect(third!.card.top).toBeCloseTo(fourth!.card.top, 1)
  expect(first!.card.left).toBeCloseTo(third!.card.left, 1)
  expect(second!.card.left).toBeCloseTo(fourth!.card.left, 1)
  expect(first!.card.right).toBeLessThan(second!.card.left)
  expect(first!.card.bottom).toBeLessThan(third!.card.top)
}

test.describe('touch overview', () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  for (const locale of ['ru', 'en'] as const) {
    for (const [index, viewport] of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }].entries()) {
      test(`${locale}: all four 4:3 cards fit and remain tappable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport)
        await visit(page, locale)
        compactLayout(await geometry(page))
        await page.screenshot({ path: testInfo.outputPath(`overview-${locale}-${viewport.width}.png`), animations: 'disabled', scale: 'css' })
        const canvas = await page.locator('canvas').elementHandle()
        const id = gardenIds[(index + (locale === 'en' ? 1 : 0)) % gardenIds.length]!
        await page.getByTestId(`garden-choice-${id}`).tap()
        await ready(page, id)
        // Browser Back is a supported return path and keeps this regression
        // focused on the overview rather than the separate garden-switch menu.
        await page.goBack()
        await ready(page)
        compactLayout(await geometry(page))
        expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
        if (locale === 'en' && viewport.width === 390) {
          const sources = (await geometry(page)).cards.map(card => card.source)
          await page.setViewportSize({ width: 844, height: 390 })
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          await ready(page)
          const rotated = await geometry(page)
          compactLayout(rotated)
          expect(rotated.cards.map(card => card.source)).toEqual(sources)
          expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
        }
      })
    }
  }
})

test('desktop retains the original full-height 2×2 layout and keyboard selection', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await visit(page, 'en')
  const state = await page.locator('.canvas-wrapper').evaluate(element => {
    const nav = element.querySelector<HTMLElement>('.garden-choices')!.getBoundingClientRect()
    return { left: nav.left, top: nav.top, width: nav.width, height: nav.height,
      worldWidth: Number(element.getAttribute('data-world-width')), worldHeight: Number(element.getAttribute('data-world-height')) }
  })
  const snapshot = await geometry(page)
  for (const [index, card] of snapshot.cards.entries()) {
    const width = (state.worldWidth - 62) / 2, height = (state.worldHeight - 62) / 2
    expect(card.card.left).toBeCloseTo(state.left + (24 + index % 2 * (width + 14)) / state.worldWidth * state.width, 0)
    expect(card.card.top).toBeCloseTo(state.top + (24 + Math.floor(index / 2) * (height + 14)) / state.worldHeight * state.height, 0)
    expect(card.card.width).toBeCloseTo(width / state.worldWidth * state.width, 0)
    expect(card.card.height).toBeCloseTo(height / state.worldHeight * state.height, 0)
    expect(card.titleFont).toBe(30)
    expect(card.descriptionFont).toBe(14)
    expect(card.caption.bottom).toBeCloseTo(card.card.bottom - 10, 0)
  }
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), animations: 'disabled', scale: 'css' })
  await page.getByTestId('garden-choice-meadow').focus()
  await page.keyboard.press('Enter')
  await ready(page, 'meadow')
})

test('resizing a committed overview during reveal reconciles its mobile art and hit targets at idle', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await visit(page, 'en')
  await page.getByTestId('garden-choice-meadow').click()
  await ready(page, 'meadow')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const canvas = await page.locator('canvas').elementHandle()
  await page.evaluate(() => {
    const runtime = window as Runtime
    const scene = document.querySelector('.canvas-wrapper')!
    runtime.heldOverviewReveal = new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (scene.getAttribute('data-transition') !== 'revealing' || scene.getAttribute('data-requested-garden') !== 'overview') return
        observer.disconnect()
        // Hold the exact committed desktop frame while ResizeObserver receives
        // the phone viewport. Browser RAF/resize delivery continues normally.
        const original = Object.getOwnPropertyDescriptor(performance, 'now')
        const frozen = performance.now()
        Object.defineProperty(performance, 'now', { configurable: true, value: () => frozen })
        runtime.releaseOverviewRevealClock = () => {
          if (original) Object.defineProperty(performance, 'now', original)
          else Reflect.deleteProperty(performance, 'now')
          delete runtime.releaseOverviewRevealClock
        }
        resolve({ committed: !!runtime.overviewTestApp?.stage.getChildByLabel('overview-scenery-meadow', true) })
      })
      observer.observe(scene, { attributes: true, attributeFilter: ['data-transition'] })
    })
  })
  try {
    await page.goBack()
    expect(await page.evaluate(() => (window as Runtime).heldOverviewReveal)).toEqual({ committed: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'revealing')
  } finally {
    await page.evaluate(() => (window as Runtime).releaseOverviewRevealClock?.())
  }
  await ready(page)
  compactLayout(await geometry(page))
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('overview-resize-after-commit.png'), animations: 'disabled', scale: 'css' })
})
