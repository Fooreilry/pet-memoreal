import { openMemorialStory } from './helpers/memorial'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { visitLocale } from './helpers/locale'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

async function ready(page: Page) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('canvas')).toHaveCount(1)
}

async function chooseGarden(page: Page, id: typeof gardens[number]) {
  await page.getByTestId('garden-switch').click()
  await page.getByTestId(`garden-${id}`).click()
  await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=${id}$`))
  await ready(page)
  await expect(page.getByTestId(`memorial-${id}-1`)).toBeVisible()
}

async function sceneryFrame(page: Page) {
  // A changed toggle must not count as proof that the WebGL scenery changed.
  // Mask just the toolbar, retaining the actual rendered garden and light.
  return page.locator('canvas').screenshot({ mask: [page.locator('.camera-toolbar')], animations: 'disabled' })
}

async function rainGroundFrame(page: Page) {
  const frame = await page.locator('canvas').screenshot({ scale: 'css', animations: 'disabled' })
  const metadata = await sharp(frame).metadata()
  // Both ponds are on the right. This left-hand ground patch also avoids the
  // title, switcher and camera panel, so only rendered weather can dominate it.
  return sharp(frame).extract({ left: Math.round(metadata.width! * 0.12), top: Math.round(metadata.height! * 0.18),
    width: Math.round(metadata.width! * 0.36), height: Math.round(metadata.height! * 0.23) }).ensureAlpha().raw().toBuffer()
}

function strongPixelChanges(before: Buffer, after: Buffer) {
  expect(after.length).toBe(before.length)
  let changed = 0
  for (let pixel = 0; pixel < before.length; pixel += 4) {
    const contrast = Math.max(Math.abs(after[pixel]! - before[pixel]!), Math.abs(after[pixel + 1]! - before[pixel + 1]!), Math.abs(after[pixel + 2]! - before[pixel + 2]!))
    if (contrast > 8) changed++
  }
  return changed
}

function failAtmosphereShaders() {
  for (const context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!context) continue
    const prototype = context.prototype
    const original = prototype.shaderSource
    prototype.shaderSource = function (this: WebGLRenderingContext | WebGL2RenderingContext, shader: WebGLShader, source: string) {
      // Break only the optional atmospheric program, leaving Pixi scenery intact.
      const broken = source.includes('uniform float uTheme;') ? `${source}\ninvalid atmosphere shader fixture;` : source
      original.call(this, shader, broken)
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: atmospheric light changes every garden's rendered scenery and can be removed completely`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visitLocale(page, '/gardens?garden=meadow', locale)
    await ready(page)
    const scene = page.locator('.canvas-wrapper')
    const toggle = page.getByTestId('garden-effects')
    const offLabel = locale === 'ru' ? 'Выключить атмосферные эффекты' : 'Turn off atmospheric effects'
    const onLabel = locale === 'ru' ? 'Включить атмосферные эффекты' : 'Turn on atmospheric effects'

    for (const garden of gardens) {
      if (garden !== 'meadow') await chooseGarden(page, garden)
      await expect(scene).toHaveAttribute('data-effects', 'on')
      await expect(scene).toHaveAttribute('data-weather', { meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' }[garden])
      await expect(scene).toHaveAttribute('data-motion', 'paused')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(toggle).toHaveAccessibleName(offLabel)
      await expect(toggle).toHaveAttribute('title', offLabel)
      await expect(toggle).toBeInViewport()
      const on = await sceneryFrame(page)
      await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${garden}-atmosphere.png`), animations: 'disabled' })

      await toggle.click()
      await expect(scene).toHaveAttribute('data-effects', 'off')
      await expect(scene).toHaveAttribute('data-weather', 'none')
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(toggle).toHaveAccessibleName(onLabel)
      await expect.poll(async () => Buffer.compare(on, await sceneryFrame(page))).not.toBe(0)
      const plain = await sceneryFrame(page)
      await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${garden}-plain.png`), animations: 'disabled' })

      await toggle.click()
      await expect(scene).toHaveAttribute('data-effects', 'on')
      await expect.poll(async () => Buffer.compare(on, await sceneryFrame(page))).toBe(0)
      await toggle.click()
      await expect.poll(async () => Buffer.compare(plain, await sceneryFrame(page))).toBe(0)
      await toggle.click()
      await expect(scene).toHaveAttribute('data-effects', 'on')
    }
    expect(errors).toEqual([])
  })
}

test('the atmospheric light preference survives garden switches and reloads, while the overview has no effect controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    if (localStorage.getItem('petmemoreal_garden_effects') === null) localStorage.setItem('petmemoreal_garden_effects', 'off')
  })
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await ready(page)
  const scene = page.locator('.canvas-wrapper')
  const toggle = page.getByTestId('garden-effects')
  await expect(scene).toHaveAttribute('data-effects', 'off')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await chooseGarden(page, 'lake')
  await expect(scene).toHaveAttribute('data-effects', 'off')
  await page.reload()
  await ready(page)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(scene).toHaveAttribute('data-effects', 'on')
  await page.reload()
  await ready(page)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-overview').click()
  await ready(page)
  await expect(scene).toHaveAttribute('data-effects', 'none')
  await expect(toggle).toHaveCount(0)
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  await page.getByTestId('garden-choice-grove').click()
  await ready(page)
  await expect(scene).toHaveAttribute('data-effects', 'on')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
})

test('lake rain is visibly animated over the ground and respects reduced motion, pause and camera movement', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await ready(page)
  const scene = page.locator('.canvas-wrapper')
  const effects = page.getByTestId('garden-effects')
  const motion = page.getByTestId('garden-motion')
  await expect(scene).toHaveAttribute('data-weather', 'rain')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const reduced = await sceneryFrame(page)
  await page.waitForTimeout(200)
  expect(Buffer.compare(reduced, await sceneryFrame(page))).toBe(0)
  await effects.click()
  await expect(scene).toHaveAttribute('data-weather', 'none')
  await effects.click()
  await expect.poll(async () => Buffer.compare(reduced, await sceneryFrame(page))).toBe(0)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const wetStart = await rainGroundFrame(page)
  await page.waitForTimeout(450)
  const wetChanges = strongPixelChanges(wetStart, await rainGroundFrame(page))
  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const stopped = await sceneryFrame(page)
  await page.waitForTimeout(250)
  expect(Buffer.compare(stopped, await sceneryFrame(page))).toBe(0)
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('lake-rain.png'), animations: 'disabled' })

  await effects.click()
  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const dryStart = await rainGroundFrame(page)
  await page.waitForTimeout(450)
  const dryChanges = strongPixelChanges(dryStart, await rainGroundFrame(page))
  // Existing motes keep moving with effects off. The fast, thin rain must create
  // substantially more visible movement than those few ambient points alone.
  expect(wetChanges).toBeGreaterThan(dryChanges + 30)
  await motion.click()
  await effects.click()
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  const zoomed = await sceneryFrame(page)
  await effects.click()
  await expect(scene).toHaveAttribute('data-weather', 'none')
  await effects.click()
  await expect.poll(async () => Buffer.compare(zoomed, await sceneryFrame(page))).toBe(0)
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  await openMemorialStory(page, stone, isMobile)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(scene).toHaveAttribute('data-weather', 'rain')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('light follows motion pause and the close-up, while toggling it leaves the garden camera and memorials usable', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=grove', 'en')
  await ready(page)
  const scene = page.locator('.canvas-wrapper')
  const effects = page.getByTestId('garden-effects')
  const motion = page.getByTestId('garden-motion')
  await expect(scene).toHaveAttribute('data-effects', 'on')
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const still = await sceneryFrame(page)
  // Sampling multiple idle frames catches an accidentally running shader clock.
  await page.waitForTimeout(250)
  expect(Buffer.compare(still, await sceneryFrame(page))).toBe(0)
  await effects.click()
  await expect(scene).toHaveAttribute('data-effects', 'off')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect.poll(async () => Buffer.compare(still, await sceneryFrame(page))).not.toBe(0)
  await effects.click()
  await expect.poll(async () => Buffer.compare(still, await sceneryFrame(page))).toBe(0)

  await motion.click()
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await effects.click()
  await expect(scene).toHaveAttribute('data-effects', 'off')
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const withoutLight = await sceneryFrame(page)
  await expect.poll(async () => Buffer.compare(withoutLight, await sceneryFrame(page))).not.toBe(0)
  await effects.click()
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  const stone = page.getByTestId('memorial-grove-1')
  await stone.focus()
  await expect(stone).toBeInViewport()
  await openMemorialStory(page, stone, isMobile)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(scene).toHaveAttribute('data-detail-state', 'ready')
  await expect(scene).toHaveAttribute('data-effects', 'on')
  // The new third level has its own living foreground; the original map stays frozen.
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const storyMoving = await sceneryFrame(page)
  await expect.poll(async () => Buffer.compare(storyMoving, await sceneryFrame(page))).not.toBe(0)
  await page.getByTestId('memorial-detail-motion').click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const storyStill = await sceneryFrame(page)
  await page.waitForTimeout(250)
  expect(Buffer.compare(storyStill, await sceneryFrame(page))).toBe(0)
  await page.getByTestId('memorial-detail-motion').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await page.getByTestId('garden-camera-reset').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('100%')
})

for (const failure of ['reload', 'enable'] as const) {
  test(`an optional shader compilation failure during ${failure} preserves the complete plain garden`, async ({ page, isMobile }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      if (localStorage.getItem('petmemoreal_garden_effects') === null) localStorage.setItem('petmemoreal_garden_effects', 'off')
    })
    const locale = failure === 'reload' ? 'ru' : 'en'
    await visitLocale(page, '/gardens?garden=lake', locale)
    await ready(page)
    const scene = page.locator('.canvas-wrapper')
    const toggle = page.getByTestId('garden-effects')
    await expect(scene).toHaveAttribute('data-effects', 'off')
    const plain = await sceneryFrame(page)

    if (failure === 'reload') {
      await page.evaluate(() => localStorage.setItem('petmemoreal_garden_effects', 'on'))
      await page.addInitScript(failAtmosphereShaders)
      await page.reload()
    } else {
      await page.evaluate(failAtmosphereShaders)
      await toggle.click()
    }
    await ready(page)
    await expect(scene).toHaveAttribute('data-effects', 'unavailable')
    await expect(toggle).toBeDisabled()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    const message = locale === 'ru' ? 'Атмосферные эффекты недоступны в этом браузере' : 'Atmospheric effects are unavailable in this browser'
    await expect(toggle).toHaveAccessibleName(message)
    await expect(toggle).toHaveAttribute('title', message)
    // Disabled weather controls cannot receive keyboard focus or mobile hover;
    // their explanation must remain discoverable from the reachable Help control.
    const help = page.getByTestId('garden-help')
    await help.focus()
    await page.keyboard.press('Enter')
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.garden-help-card')).toContainText(message)
    await page.keyboard.press('Escape')
    await expect(page.locator('.garden-help-card')).toHaveCount(0)
    await expect(help).toBeFocused()
    // A failed filter must restore the default framebuffer, not just hide its UI.
    await expect.poll(async () => Buffer.compare(plain, await sceneryFrame(page))).toBe(0)
    await page.locator('canvas').screenshot({ path: testInfo.outputPath(`shader-${failure}-fallback.png`), animations: 'disabled' })

    await page.getByTestId('garden-zoom-in').click()
    await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
    const stone = page.getByTestId('memorial-lake-1')
    await stone.focus()
    await expect(stone).toBeInViewport()
    await openMemorialStory(page, stone, isMobile)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-effects', 'unavailable')
    expect(errors).toEqual([])
  })
}
