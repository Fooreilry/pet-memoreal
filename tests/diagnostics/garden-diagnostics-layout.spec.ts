import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { localeCookieName } from '../../shared/locale'
import { enterGarden } from './helpers'

const origin = 'http://127.0.0.1:4180'

async function withinViewport(page: Page, element: Locator) {
  await expect.poll(async () => {
    const bounds = await element.boundingBox()
    const viewport = page.viewportSize()!
    return !!bounds && bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1
  }).toBe(true)
}

test('diagnostics panel fits desktop and narrow phones with scrollable readings and nested keyboard controls', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const unexpectedApi: string[] = []
  await page.context().addCookies([
    { name: localeCookieName, value: 'en', url: origin },
    { name: 'petmemoreal_garden_session', value: '424242', url: origin }
  ])
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (pathname === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } })
    if (pathname === '/api/auth/get-session') return route.fulfill({ json: null })
    if (/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/.test(pathname)) return route.fulfill({ json: [] })
    unexpectedApi.push(pathname)
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected diagnostics layout fixture request' } })
  })
  await enterGarden(page, `${origin}/gardens?garden=lake`)
  const scene = page.locator('.canvas-wrapper')
  const toggle = page.getByTestId('diagnostics-toggle')
  const panel = page.getByTestId('diagnostics-panel')
  const fps = page.getByTestId('diagnostics-fps')
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport)
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-transition', 'idle')
    await expect.poll(() => page.evaluate(() => !!(window as Window & { __gardenDiagnostics?: { ready: () => boolean } }).__gardenDiagnostics?.ready())).toBe(true)
    await toggle.click()
    await expect(panel).toBeVisible()
    await expect(scene).toHaveAttribute('data-diagnostics', 'panel')
    await expect(panel.getByRole('table')).toBeVisible()
    await withinViewport(page, panel)
    expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)

    for (const control of [toggle, page.getByTestId('diagnostics-mode'), fps, panel.getByRole('button', { name: 'Close diagnostics' }), page.getByTestId('diagnostics-start'), page.getByTestId('diagnostics-stop'), page.getByTestId('diagnostics-benchmark-start'), page.getByTestId('diagnostics-export')]) {
      // The shared popover briefly scales during entry; measure settled targets.
      await expect.poll(async () => {
        const bounds = await control.boundingBox()
        return bounds ? Math.min(bounds.width, bounds.height) : 0
      }).toBeGreaterThanOrEqual(44)
    }
    await panel.evaluate(element => { element.scrollTop = 0 })
    await panel.screenshot({ path: testInfo.outputPath(`diagnostics-panel-${viewport.width}.png`), animations: 'disabled', scale: 'css' })
    await panel.getByRole('table').scrollIntoViewIfNeeded()
    await panel.screenshot({ path: testInfo.outputPath(`diagnostics-panel-metrics-${viewport.width}.png`), animations: 'disabled', scale: 'css' })

    await fps.click()
    const options = page.getByRole('listbox')
    await expect(options.getByRole('option')).toHaveCount(2)
    await withinViewport(page, options)
    await expect.poll(async () => {
      const trigger = (await fps.boundingBox())!
      const popup = (await options.boundingBox())!
      return Math.max(Math.abs(popup.width - trigger.width), Math.abs(popup.x - trigger.x))
    }).toBeLessThanOrEqual(1)
    if (viewport.width === 1440) await page.screenshot({ path: testInfo.outputPath('diagnostics-fps-options.png'), animations: 'disabled', scale: 'css' })
    await page.keyboard.press('Escape')
    await expect(options).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(fps).toBeFocused()

    await page.getByTestId('diagnostics-export').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('diagnostics-export')).toBeInViewport()
    await panel.screenshot({ path: testInfo.outputPath(`diagnostics-panel-actions-${viewport.width}.png`), animations: 'disabled', scale: 'css' })
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(toggle).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  }
  expect(unexpectedApi).toEqual([])
})
