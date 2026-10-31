import { clickGardenControl } from './helpers/garden-controls'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'
import { openMemorialStory, revealMemorialMarker } from './helpers/memorial'
import { getMonumentKind } from '../../app/data/monuments'
import sharp from 'sharp'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

async function cameraPosition(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ({
    zoom: element.getAttribute('data-zoom'),
    x: element.getAttribute('data-camera-x'),
    y: element.getAttribute('data-camera-y')
  }))
}

async function detailReady(page: Page, id: string) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-id', id)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await expect(page.getByTestId('memorial-detail')).toBeVisible()
  await expect.poll(() => page.locator('.canvas-wrapper').evaluate((scene) => {
    const host = scene.querySelector<HTMLElement>('.canvas-host')!
    const canvas = scene.querySelector('canvas')!
    const width = Number(scene.getAttribute('data-drawing-width'))
    const height = Number(scene.getAttribute('data-drawing-height'))
    const marginX = Number(scene.getAttribute('data-drawing-margin-x'))
    const marginY = Number(scene.getAttribute('data-drawing-margin-y'))
    const density = Math.min(devicePixelRatio || 1, 2)
    return Math.max(Math.abs(width - host.clientWidth - marginX * 2), Math.abs(height - host.clientHeight - marginY * 2),
      Math.abs(canvas.clientWidth - width), Math.abs(canvas.clientHeight - height),
      Math.abs(canvas.width / density - width), Math.abs(canvas.height / density - height))
  })).toBeLessThanOrEqual(1)
}

async function within(element: Locator, bounds: Locator) {
  await expect.poll(async () => {
    const child = await element.boundingBox()
    const parent = await bounds.boundingBox()
    return !!child && !!parent && child.x >= parent.x - 1 && child.y >= parent.y - 1
      && child.x + child.width <= parent.x + parent.width + 1
      && child.y + child.height <= parent.y + parent.height + 1
  }).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: full information opens each garden's close-up in the same canvas and restores the map`, async ({ page, isMobile }, testInfo) => {
    test.slow()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visitLocale(page, '/gardens', locale)
    for (const garden of gardens) {
      if (garden === 'meadow') await page.getByTestId('garden-choice-meadow').click()
      else {
        await page.getByTestId('garden-switch').click()
        await page.getByTestId(`garden-${garden}`).click()
      }
      const scene = page.locator('.canvas-wrapper')
      await expect(scene).toHaveAttribute('data-state', 'ready')
      const canvas = await page.locator('canvas').elementHandle()
      await page.getByTestId('garden-zoom-in').click()
      const stone = page.getByTestId(`memorial-${garden}-1`)
      await revealMemorialMarker(stone)
      await stone.focus()
      const before = await cameraPosition(page)
      await openMemorialStory(page, stone, isMobile)
      await detailReady(page, `${garden}-1`)
      await expect(scene).toHaveAttribute('data-detail-theme', garden)
      await expect(scene).toHaveAttribute('data-detail-kind', getMonumentKind(garden, 1))
      await expect(page.locator('canvas')).toHaveCount(1)
      expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
      const detail = page.getByTestId('memorial-detail')
      const dialog = page.getByRole('dialog').filter({ has: detail })
      await expect(dialog).not.toHaveAttribute('aria-modal', 'true')
      await expect(page.getByTestId('garden-header')).toBeVisible()
      await expect(page.locator('.camera-toolbar:visible, .garden-hud:visible')).toHaveCount(0)
      await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
      await expect(detail.locator('.memorial-story p')).not.toBeEmpty()
      await within(detail, page.locator('.garden-stage'))
      const panel = detail.locator('.memorial-detail-panel')
      const paper = (await panel.boundingBox())!
      const stage = (await page.locator('.garden-stage').boundingBox())!
      const reading = (await page.getByTestId('memorial-detail-reading').boundingBox())!
      const visual = (await page.getByTestId('memorial-detail-visual').boundingBox())!
      if (stage.width >= 760) {
        expect(paper.x - stage.x).toBeGreaterThanOrEqual(8)
        expect(stage.y + stage.height - paper.y - paper.height).toBeGreaterThanOrEqual(8)
        expect(await panel.evaluate(element => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThanOrEqual(8)
        await expect(panel).not.toHaveCSS('box-shadow', 'none')
        expect(reading.x + reading.width).toBeLessThanOrEqual(visual.x + 1)
        expect(visual.width).toBeGreaterThan(300)
      } else {
        expect(visual.height).toBeGreaterThanOrEqual(180)
        expect(visual.height).toBeLessThanOrEqual(340)
        expect(paper.y).toBeGreaterThanOrEqual(visual.y + visual.height + 10)
        expect(paper.x - stage.x).toBeCloseTo(12, 0)
        expect(stage.x + stage.width - paper.x - paper.width).toBeCloseTo(12, 0)
      }
      await within(detail.locator('.memorial-return'), page.getByTestId('memorial-detail-visual'))
      await within(page.getByTestId('memorial-share'), panel)
      await expect(detail.locator('.memorial-story p')).not.toBeEmpty()
      await page.screenshot({ path: testInfo.outputPath(`${garden}-close-up-${locale}.png`), animations: 'disabled', scale: 'css' })
      const expand = page.getByTestId('memorial-detail-expand')
      if (stage.width < 760) {
        await expect(expand).toHaveAttribute('aria-expanded', 'false')
        const readingScroll = await page.getByTestId('memorial-detail-reading').evaluate(element => element.scrollTop)
        await expand.click()
        await expect(expand).toHaveAttribute('aria-expanded', 'true')
        await expect.poll(async () => {
          const expanded = (await panel.boundingBox())!
          return Math.max(Math.abs(expanded.y - stage.y - 12), Math.abs(expanded.height - stage.height + 24))
        }).toBeLessThanOrEqual(1)
        await within(expand, panel)
        await within(detail.locator('.memorial-return'), panel)
        await expect(page.getByTestId('memorial-detail-visual')).toHaveAttribute('inert', '')
        await page.screenshot({ path: testInfo.outputPath(`${garden}-expanded-${locale}.png`), animations: 'disabled', scale: 'css' })
        expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
        expect(await cameraPosition(page)).toEqual(before)
        await expand.click()
        await expect(expand).toHaveAttribute('aria-expanded', 'false')
        await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(paper.y, 0)
        await expect(page.getByTestId('memorial-detail-reading')).toHaveJSProperty('scrollTop', readingScroll)
        await expect(page.getByTestId('memorial-detail-visual')).not.toHaveAttribute('inert', '')
      } else {
        await expect(expand).toHaveCount(0)
      }
      expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
      await detail.locator('.memorial-return').click()
      await expect(detail).toHaveCount(0)
      await expect(scene).toHaveAttribute('data-detail-state', 'none')
      await expect(stone).toBeFocused()
      expect(await cameraPosition(page)).toEqual(before)
      await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
      await expect(page.getByTestId('garden-zoom-in')).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test(`${locale}: a saved deep link keeps the complete story, attribution and edit permission through resize`, async ({ page }, testInfo) => {
    const id = 'f0450ee2-6f73-4f12-9b25-1ac673603883'
    const name = (locale === 'ru' ? 'Наш любимый маленький солнечный друг ' : 'Our beloved little companion in the sunshine ').repeat(3).slice(0, 80)
    const sentence = locale === 'ru' ? 'Мы помним наши прогулки и тёплые вечера рядом. ' : 'We remember our walks and all the quiet evenings together. '
    const story = Array.from({ length: 120 }, () => sentence).join('\n\n').slice(0, 5000)
    const creatorName = locale === 'ru' ? null : 'Alex'
    await page.route('**/api/gardens/lake/memorials', route => route.fulfill({ json: [{
      source: 'saved', id, gardenId: 'lake', place: 2, name, species: 'cat', born: 2012, died: 2024,
      story, creatorName, canEdit: true
    }] }))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visitLocale(page, `/gardens?garden=lake&memorial=${id}`, locale)
    await detailReady(page, id)
    const detail = page.getByTestId('memorial-detail')
    await expect(page.getByRole('dialog').filter({ has: detail })).toHaveAccessibleName(name)
    await expect(detail).toContainText(name)
    await expect(detail.locator('.memorial-story p')).toHaveText(story)
    await expect(detail.getByTestId('memorial-creator')).toContainText(creatorName ?? 'Анонимно')
    await expect(detail.getByTestId('memorial-edit')).toHaveAttribute('href', `/memorials/${id}/edit`)
    await expect(detail.locator('.memorial-return')).toBeFocused()
    const canvas = await page.locator('canvas').elementHandle()
    for (const size of [page.viewportSize()!, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await detailReady(page, id)
      await within(detail.locator('.memorial-return'), page.locator('.garden-stage'))
      await within(detail.locator('.memorial-return'), page.locator('.garden-stage'))
      const returnBefore = (await detail.locator('.memorial-return').boundingBox())!
      const reading = page.getByTestId('memorial-detail-reading')
      await reading.evaluate(element => { element.scrollTop = element.scrollHeight })
      expect(await reading.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      expect((await detail.locator('.memorial-return').boundingBox())!.y).toBeCloseTo(returnBefore.y, 0)
      expect(await detail.locator('.memorial-story p').evaluate(element => getComputedStyle(element).fontSize)).toBe('16px')
      expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
      await expect(page.locator('canvas')).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`saved-detail-${locale}-${size.width}x${size.height}.png`), animations: 'disabled', scale: 'css' })
    }
    // Returning to portrait restores the two-part view. Expanding changes only
    // the reading card, preserving the existing scene and complete saved story.
    await page.setViewportSize({ width: 390, height: 844 })
    await detailReady(page, id)
    const reading = page.getByTestId('memorial-detail-reading')
    const panel = detail.locator('.memorial-detail-panel')
    const expand = page.getByTestId('memorial-detail-expand')
    await reading.evaluate(element => { element.scrollTop = 240 })
    const scrollBeforeExpand = await reading.evaluate(element => element.scrollTop)
    await expand.click()
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    const stage = (await page.locator('.garden-stage').boundingBox())!
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(stage.height - 26)
    await expect(page.getByTestId('memorial-detail-visual')).toHaveAttribute('inert', '')
    await expect(page.getByTestId('memorial-detail-visual')).toHaveAttribute('aria-hidden', 'true')
    await expect(detail.locator('.memorial-story p')).toHaveText(story)
    await expect(reading).toHaveJSProperty('scrollTop', scrollBeforeExpand)
    await within(page.getByTestId('memorial-detail-return'), panel)
    await expand.click()
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(reading).toHaveJSProperty('scrollTop', scrollBeforeExpand)
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
    await page.getByTestId('memorial-detail-return').click()
    await expect(detail).toHaveCount(0)
    await expect(page.getByTestId(`memorial-${id}`)).toBeFocused()
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  })
}

test('phone reading lifts over the monument, reverses without rebuilding and respects reduced motion', async ({ page, isMobile }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  const stone = page.getByTestId('memorial-hill-1')
  await openMemorialStory(page, stone, isMobile)
  await detailReady(page, 'hill-1')
  const panel = page.locator('.memorial-detail-panel')
  const expand = page.getByTestId('memorial-detail-expand')
  await panel.evaluate(element => Promise.allSettled(element.getAnimations().map(animation => animation.finished)))
  const stage = (await page.locator('.garden-stage').boundingBox())!
  const original = (await panel.boundingBox())!
  const canvas = await page.locator('canvas').elementHandle()
  const camera = await cameraPosition(page)
  const during = await panel.evaluate(async (element) => {
    element.querySelector<HTMLButtonElement>('[data-testid="memorial-detail-expand"]')!.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {
      top: element.getBoundingClientRect().top,
      animating: element.getAnimations().some(animation => animation.playState === 'running')
    }
  })
  expect(during.animating).toBe(true)
  expect(during.top).toBeLessThan(original.y)
  expect(during.top).toBeGreaterThan(stage.y + 12)
  await expect(expand).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(stage.y + 12, 0)
  await expect(page.getByTestId('memorial-detail-effects')).not.toBeFocused()
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
  expect(await cameraPosition(page)).toEqual(camera)
  await page.screenshot({ path: testInfo.outputPath('phone-reading-expanded.png'), animations: 'disabled', scale: 'css' })
  await expand.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(original.y, 0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expand.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(stage.y + 12, 0)
  expect(await panel.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detailReady(page, 'hill-1')
  await expect(expand).toHaveCount(0)
  const desktopPanel = (await panel.boundingBox())!
  const visual = (await page.getByTestId('memorial-detail-visual').boundingBox())!
  expect(desktopPanel.x + desktopPanel.width).toBeLessThan(visual.x)
  await within(page.getByTestId('memorial-detail-return'), page.getByTestId('memorial-detail-visual'))
  await page.getByTestId('memorial-detail-return').click()
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  await expect(stone).toBeFocused()
})

test('close-up weather and movement share the garden controls and freeze without changing the camera', async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await revealMemorialMarker(stone)
  await stone.focus()
  const before = await cameraPosition(page)
  await openMemorialStory(page, stone, isMobile)
  await detailReady(page, 'lake-1')
  await expect(scene).toHaveAttribute('data-weather', 'rain')
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const motion = page.getByTestId('memorial-detail-motion')
  const effects = page.getByTestId('memorial-detail-effects')
  const detailFrame = async () => {
    const visual = (await page.getByTestId('memorial-detail-visual').boundingBox())!
    // Focus rings extend outside button masks; compare the landscape below the HUD.
    const headerHeight = Math.min(96, visual.height * .4)
    // Chrome does not preserve a device-aligned fractional clip end to end.
    // Capture whole CSS pixels inside the visual window, excluding its final
    // fractional boundary row, while keeping exact equality for the landscape.
    const left = Math.ceil(visual.x)
    const top = Math.ceil(visual.y + headerHeight)
    const right = Math.floor(visual.x + visual.width)
    const bottom = Math.floor(visual.y + visual.height) - 1
    return page.screenshot({ clip: { x: left, y: top, width: right - left, height: bottom - top }, animations: 'disabled', scale: 'css' })
  }
  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const frame = await detailFrame()
  await page.waitForTimeout(180)
  expect(Buffer.compare(frame, await detailFrame())).toBe(0)
  await effects.click()
  await expect(scene).toHaveAttribute('data-effects', 'off')
  await expect(scene).toHaveAttribute('data-weather', 'none')
  await expect.poll(async () => Buffer.compare(frame, await detailFrame())).not.toBe(0)
  await effects.click()
  await expect(scene).toHaveAttribute('data-effects', 'on')
  let restoredFrame: Buffer | undefined
  try {
    await expect.poll(async () => {
      restoredFrame = await detailFrame()
      return Buffer.compare(frame, restoredFrame)
    }).toBe(0)
  } catch (error) {
    await testInfo.attach('paused-weather-initial', { body: frame, contentType: 'image/png' })
    if (restoredFrame) await testInfo.attach('paused-weather-restored', { body: restoredFrame, contentType: 'image/png' })
    throw error
  }
  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await page.screenshot({ path: testInfo.outputPath('animated-lake-detail.png'), animations: 'disabled', scale: 'css' })
  await page.getByTestId('memorial-detail-return').click()
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  expect(await cameraPosition(page)).toEqual(before)
  await expect(scene).toHaveAttribute('data-motion', 'running')
})

test('every close-up has perceptible weather across its scenery and preserves the exact paused frame', async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  for (const garden of gardens) {
    if (garden !== 'meadow') {
      await page.getByTestId('garden-switch').click()
      await page.getByTestId(`garden-${garden}`).click()
    }
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    await openMemorialStory(page, page.getByTestId(`memorial-${garden}-1`), isMobile)
    await detailReady(page, `${garden}-1`)
    const effects = page.getByTestId('memorial-detail-effects')
    await effects.focus()
    const capture = async () => page.screenshot({
      clip: (await page.getByTestId('memorial-detail-visual').boundingBox())!,
      mask: [effects], animations: 'disabled', scale: 'css'
    })
    const lit = await capture()
    await effects.click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-effects', 'off')
    const unlit = await capture()
    const before = await sharp(lit).ensureAlpha().raw().toBuffer()
    const after = await sharp(unlit).ensureAlpha().raw().toBuffer()
    expect(after.length).toBe(before.length)
    let changed = 0
    for (let pixel = 0; pixel < before.length; pixel += 4) {
      const contrast = Math.max(Math.abs(before[pixel]! - after[pixel]!), Math.abs(before[pixel + 1]! - after[pixel + 1]!), Math.abs(before[pixel + 2]! - after[pixel + 2]!))
      if (contrast > 8) changed++
    }
    expect(changed / (before.length / 4), `${garden}: weather should change a visible part of the landscape`).toBeGreaterThan(.025)
    await effects.click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-effects', 'on')
    await expect.poll(async () => Buffer.compare(lit, await capture())).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`${garden}-perceptible-weather.png`), animations: 'disabled', scale: 'css' })
    await page.getByTestId('memorial-detail-return').click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'none')
  }
})

test('keyboard detail activation consumes Escape before restoring an expanded map and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await clickGardenControl(page, 'garden-fullscreen')
  const stone = page.getByTestId('memorial-hill-1')
  await revealMemorialMarker(stone)
  await stone.focus()
  const before = await cameraPosition(page)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  await page.keyboard.press('Enter')
  await detailReady(page, 'hill-1')
  await expect(page.getByTestId('memorial-detail-motion')).toHaveCount(0)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-motion', 'paused')
  await expect(page.getByTestId('memorial-detail').locator('.memorial-return')).toBeFocused()
  const expand = page.getByTestId('memorial-detail-expand')
  if ((await page.locator('.garden-stage').boundingBox())!.width < 760) {
    await expand.focus()
    await page.keyboard.press('Enter')
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(expand).toBeFocused()
    await expect(page.getByTestId('memorial-detail')).toBeVisible()
    await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  } else {
    await expect(expand).toHaveCount(0)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  await expect(stone).toBeFocused()
  expect(await cameraPosition(page)).toEqual(before)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'false')
})

test('an unsupported weather shader leaves the close-up and its complete story available', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    for (const context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!context) continue
      const original = context.prototype.shaderSource
      context.prototype.shaderSource = function (this: WebGLRenderingContext | WebGL2RenderingContext, shader: WebGLShader, source: string) {
        original.call(this, shader, source.includes('uniform float uTheme;') ? `${source}\ninvalid optional weather fixture;` : source)
      }
    }
  })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-effects', 'unavailable')
  const stone = page.getByTestId('memorial-lake-1')
  await openMemorialStory(page, stone, isMobile)
  await detailReady(page, 'lake-1')
  await expect(page.getByTestId('memorial-detail').locator('.memorial-story p')).not.toBeEmpty()
  await expect(page.getByTestId('memorial-detail-effects')).toBeDisabled()
  await expect(page.locator('#memorial-detail-weather-note')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('detail-without-optional-weather.png'), animations: 'disabled', scale: 'css' })
  await page.getByTestId('memorial-detail-return').click()
  await expect(stone).toBeFocused()
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('short phone canvases keep expansion, return and pinned sharing controls reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=hill&memorial=hill-1', 'en')
  await detailReady(page, 'hill-1')
  const panel = page.locator('.memorial-detail-panel')
  const expand = page.getByTestId('memorial-detail-expand')
  const back = page.getByTestId('memorial-detail-return')
  const share = page.getByTestId('memorial-share')
  for (const viewport of [{ width: 390, height: 390 }, { width: 320, height: 450 }]) {
    await page.setViewportSize(viewport)
    await detailReady(page, 'hill-1')
    await within(expand, panel)
    await within(back, page.getByTestId('memorial-detail-visual'))
    await within(share, panel)
    expect((await expand.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expand.click()
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    await within(expand, page.locator('.garden-stage'))
    await within(back, panel)
    await within(share, panel)
    await page.keyboard.press('Escape')
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(expand).toBeFocused()
  }
  await back.click()
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  await expect(page.getByTestId('memorial-hill-1')).toBeFocused()
})
