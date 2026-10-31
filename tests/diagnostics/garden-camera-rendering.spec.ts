import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Application } from 'pixi.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { GardenDiagnosticsReport, GardenDiagnosticsSnapshot } from '../../app/utils/gardenDiagnostics'
import { localeCookieName } from '../../shared/locale'
import { enterGarden } from './helpers'

type Runtime = Window & {
  cameraRenderingApp?: Application
  __gardenDiagnostics?: {
    ready: () => boolean
    snapshot: () => GardenDiagnosticsSnapshot
    beginRun: (scenario: string) => string
    endRun: (reason?: string) => GardenDiagnosticsReport | undefined
    camera: (view: { zoom: number, x: number, y: number }) => void
    setPaused: (value: boolean) => void
    startCameraMotion: (duration?: number) => void
    stopCameraMotion: () => void
    getMotionInfo: () => { samples: number, changes: number }
  }
}
const origin = 'http://127.0.0.1:4180'

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function visit(page: Page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.context().addCookies([
    { name: localeCookieName, value: 'en', url: origin },
    { name: 'petmemoreal_garden_session', value: '424242', url: origin }
  ])
  await page.addInitScript(() => {
    // Observe the existing application; no production test globals or extra
    // renderer/ticker are needed to distinguish automatic and paused frames.
    window.__PIXI_APP_INIT__ = app => {
      if ('stage' in app) (window as Runtime).cameraRenderingApp = app
    }
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (path === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401 } })
    if (path === '/api/auth/get-session') return route.fulfill({ json: null })
    if (/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/.test(path)) return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected camera rendering fixture request' } })
  })
  await enterGarden(page, `${origin}/gardens?garden=meadow&diagnosticsMode=collect`)
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-motion', reduced ? 'paused' : 'running')
  await expect.poll(() => page.evaluate(() => (window as Runtime).cameraRenderingApp?.ticker.started)).toBe(!reduced)
  await frames(page)
}

async function end(page: Page) {
  return page.evaluate(() => (window as Runtime).__gardenDiagnostics!.endRun('camera-rendering-acceptance')!)
}

function automaticOnly(result: GardenDiagnosticsReport) {
  expect(result.counts.ticks).toBeGreaterThan(0)
  expect(result.counts.manualRenders).toBe(0)
  expect(result.counts.activeManualRenders).toBe(0)
  expect(result.counts.renders).toBe(result.counts.automaticRenders)
  expect(result.counts.automaticRenders).toBe(result.counts.ticks)
  expect(result.counts.generations).toBe(0)
}

test('ticker-driven camera uses exactly one automatic render per animation update', async ({ page }, testInfo) => {
  await visit(page)
  await page.evaluate(() => {
    const api = (window as Runtime).__gardenDiagnostics!
    api.beginRun('ticker-camera-no-duplicate-renders')
    api.startCameraMotion(30_000)
  })
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.snapshot().counts.ticks)).toBeGreaterThanOrEqual(10)
  const movement = await page.evaluate(() => {
    const api = (window as Runtime).__gardenDiagnostics!
    api.stopCameraMotion()
    return api.getMotionInfo()
  })
  expect(movement.changes).toBeGreaterThan(5)
  const result = await end(page)
  automaticOnly(result)
  const path = testInfo.outputPath('ticker-camera-rendering.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(result, null, 2))
  await testInfo.attach('ticker-camera-rendering.json', { path, contentType: 'application/json' })
})

test('trusted pointer drag and wheel use the running ticker without manual draws', async ({ page }) => {
  await visit(page)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.camera({ zoom: 2, x: -100, y: -100 }))
  await frames(page)
  const scene = page.locator('.canvas-wrapper')
  const before = await scene.evaluate(element => ({ x: element.getAttribute('data-camera-x'), zoom: element.getAttribute('data-zoom') }))
  const box = (await scene.boundingBox())!
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('trusted-input-no-duplicate-renders'))
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .5 - 80, box.y + box.height * .5 - 60, { steps: 8 })
  await page.mouse.up()
  await page.mouse.wheel(0, -100)
  await expect(scene).not.toHaveAttribute('data-zoom', before.zoom!)
  await expect(scene).not.toHaveAttribute('data-camera-x', before.x!)
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.snapshot().counts.ticks)).toBeGreaterThanOrEqual(5)
  automaticOnly(await end(page))
})

test('paused camera changes coalesce into one visible frame without advancing animation', async ({ page }) => {
  await visit(page)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.setPaused(true))
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-motion', 'paused')
  await expect.poll(() => page.evaluate(() => (window as Runtime).cameraRenderingApp!.ticker.started)).toBe(false)
  await frames(page)
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  await page.evaluate(() => {
    const api = (window as Runtime).__gardenDiagnostics!
    api.beginRun('coalesced-paused-camera')
    api.camera({ zoom: 1.25, x: -20, y: -10 })
    api.camera({ zoom: 1.5, x: -45, y: -25 })
    api.camera({ zoom: 2, x: -100, y: -70 })
  })
  await frames(page)
  const after = await canvas.screenshot()
  expect(Buffer.compare(before, after)).not.toBe(0)
  await frames(page)
  expect(Buffer.compare(after, await canvas.screenshot())).toBe(0)
  const result = await end(page)
  expect(result.counts.ticks).toBe(0)
  expect(result.counts.automaticRenders).toBe(0)
  expect(result.counts.manualRenders).toBe(1)
  expect(result.counts.generations).toBe(0)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', '2.000')
})

test('resuming before a queued paused frame cancels the redundant manual draw', async ({ page }) => {
  await visit(page)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.setPaused(true))
  await expect.poll(() => page.evaluate(() => (window as Runtime).cameraRenderingApp!.ticker.started)).toBe(false)
  await frames(page)
  await page.evaluate(async () => {
    const api = (window as Runtime).__gardenDiagnostics!
    api.beginRun('resume-takes-over-pending-camera-frame')
    api.camera({ zoom: 2, x: -100, y: -70 })
    api.setPaused(false)
    // Let Vue commit the resumed ticker while still in this browser task,
    // before the queued requestAnimationFrame callbacks can run.
    await Promise.resolve()
  })
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.snapshot().counts.ticks)).toBeGreaterThanOrEqual(5)
  automaticOnly(await end(page))
})

test('a camera change in the same task as pausing is painted after the ticker stops', async ({ page }) => {
  await visit(page)
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  const runningBeforeFlush = await page.evaluate(() => {
    const runtime = window as Runtime
    const api = runtime.__gardenDiagnostics!
    api.beginRun('pause-and-camera-in-one-task')
    api.setPaused(true)
    const running = runtime.cameraRenderingApp!.ticker.started
    api.camera({ zoom: 2, x: -100, y: -70 })
    return running
  })
  expect(runningBeforeFlush).toBe(true, 'the camera update must occur before Vue stops the ticker')
  await expect.poll(() => page.evaluate(() => (window as Runtime).cameraRenderingApp!.ticker.started)).toBe(false)
  await frames(page)
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0)
  const result = await end(page)
  expect(result.counts.ticks).toBe(0)
  expect(result.counts.automaticRenders).toBe(0)
  expect(result.counts.manualRenders).toBe(1)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', '2.000')
})

test('system reduced motion still allows the camera to paint a stopped scene', async ({ page }) => {
  await visit(page, true)
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  await page.evaluate(() => {
    const api = (window as Runtime).__gardenDiagnostics!
    api.beginRun('reduced-motion-camera')
    api.camera({ zoom: 1.75, x: -80, y: -50 })
  })
  await frames(page)
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0)
  const result = await end(page)
  expect(result.counts.ticks).toBe(0)
  expect(result.counts.automaticRenders).toBe(0)
  expect(result.counts.manualRenders).toBe(1)
})
