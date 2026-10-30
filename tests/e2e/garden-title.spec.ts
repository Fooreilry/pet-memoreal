import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'
import { openMemorialStory } from './helpers/memorial'

type TitleEvent = { title: string, visible: boolean, time: number }

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

async function observeTitles(page: Page) {
  await page.addInitScript(() => {
    const runtime = window as Window & { gardenTitleEvents?: TitleEvent[] }
    const events: TitleEvent[] = []
    runtime.gardenTitleEvents = events
    let previous = ''
    const record = () => {
      const heading = document.querySelector('[data-testid="garden-title"]')
      if (!heading) return
      const title = heading.textContent?.trim() ?? ''
      const visible = heading.getAttribute('data-title-visible') === 'true'
      const key = `${title}:${visible}`
      if (key === previous) return
      previous = key
      events.push({ title, visible, time: performance.now() })
    }
    new MutationObserver(record).observe(document, { attributes: true, attributeFilter: ['data-title-visible'], childList: true, characterData: true, subtree: true })
  })
}

async function titleEvents(page: Page) {
  return page.evaluate(() => (window as Window & { gardenTitleEvents?: TitleEvent[] }).gardenTitleEvents ?? [])
}

async function ready(page: Page, garden: string) {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(scene).toHaveAttribute('data-requested-garden', garden)
}

async function expectFullTitleInterval(page: Page, name: string) {
  const heading = page.getByTestId('garden-title')
  await expect(heading).toHaveAttribute('data-title-visible', 'false', { timeout: 4500 })
  await expect(heading).toHaveCSS('opacity', '0')
  const events = await titleEvents(page)
  const shown = events.findLast(event => event.title === name && event.visible)
  expect(shown).toBeDefined()
  const hidden = events.find(event => event.title === name && !event.visible && event.time > shown!.time)
  expect(hidden).toBeDefined()
  // Observe the actual state changes, rather than measuring driver calls that
  // can arrive partway through the title's three-second interval.
  expect(hidden!.time - shown!.time).toBeGreaterThanOrEqual(2950)
  expect(hidden!.time - shown!.time).toBeLessThan(4200)
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await observeTitles(page)
})

test('the garden title fades after three seconds while its heading, focus and document title remain; another garden starts a fresh interval', async ({ page }) => {
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await ready(page, 'lake')
  const heading = page.getByTestId('garden-title')
  await expect(heading).toHaveText('Lake')
  await expect(heading).toHaveAttribute('data-title-visible', 'true')
  await expect(heading).toHaveCSS('opacity', '1')
  await expect(heading).toHaveCSS('transition-duration', '0.15s')
  const originalHeading = await heading.elementHandle()
  const documentTitle = await page.title()
  await heading.focus()
  await expectFullTitleInterval(page, 'Lake')
  await expect(page.getByRole('heading', { level: 1, name: 'Lake', exact: true })).toHaveCount(1)
  await expect(heading).not.toHaveAttribute('aria-hidden')
  await expect(heading).toBeFocused()
  expect(await originalHeading!.evaluate(element => element.isConnected)).toBe(true)
  await expect(page).toHaveTitle(documentTitle)

  await page.getByTestId('garden-next').click()
  await ready(page, 'grove')
  await expect(heading).toHaveText('Grove')
  await expect(heading).toHaveAttribute('data-title-visible', 'true')
  await expect(heading).toHaveCSS('opacity', '1')
  await expectFullTitleInterval(page, 'Grove')
  expect(await originalHeading!.evaluate(element => element.isConnected)).toBe(true)
  await page.goBack()
  await ready(page, 'lake')
  await expect(heading).toHaveAttribute('data-title-visible', 'true')
})

test('loading does not consume the title interval and cancelling a neighboring garden does not restart the source title', async ({ page }) => {
  const lakeLoading = gate()
  const groveLoading = gate()
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await lakeLoading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  await page.route('**/api/gardens/grove/memorials', async (route) => {
    await groveLoading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens', 'en')
    await ready(page, 'overview')
    await page.getByTestId('garden-choice-lake').click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    // A deliberate real wait proves a slow response cannot exhaust the timer;
    // freezing the browser clock here would also freeze the Pixi preparation.
    await page.waitForTimeout(3300)
    await expect(page.getByTestId('garden-loading')).toBeVisible()
    await expect(page.getByTestId('garden-title')).toHaveAttribute('data-title-visible', 'false')
    expect((await titleEvents(page)).some(event => event.visible && event.title === 'Lake')).toBe(false)
    lakeLoading.release()
    await ready(page, 'lake')
    await expect(page.getByTestId('garden-title')).toHaveAttribute('data-title-visible', 'true')
    await expect(page.getByTestId('garden-title')).toHaveCSS('opacity', '1')
    await expectFullTitleInterval(page, 'Lake')

    const appearanceCount = (await titleEvents(page)).filter(event => event.visible).length
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/garden=grove/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/garden=lake/)
    await ready(page, 'lake')
    await expect(page.getByTestId('garden-title')).toHaveAttribute('data-title-visible', 'false')
    await expect(page.getByTestId('garden-title')).toHaveCSS('opacity', '0')
    expect((await titleEvents(page)).filter(event => event.visible)).toHaveLength(appearanceCount)
  } finally {
    lakeLoading.release()
    groveLoading.release()
  }
})

test('returning from a memorial in the same garden keeps the expired title hidden and reduced motion removes its fade', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=lake', 'ru')
  await ready(page, 'lake')
  const heading = page.getByTestId('garden-title')
  await expect(heading).toHaveAttribute('data-title-visible', 'true')
  await expect(heading).toHaveCSS('transition-duration', '0s')
  const originalHeading = await heading.elementHandle()
  await expectFullTitleInterval(page, 'Озеро')
  const appearanceCount = (await titleEvents(page)).filter(event => event.visible).length
  const stone = page.getByTestId('memorial-lake-1')
  await openMemorialStory(page, stone, isMobile)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  expect(await originalHeading!.evaluate(element => element.isConnected)).toBe(true)
  await page.getByTestId('memorial-detail-close').click()
  await ready(page, 'lake')
  await expect(heading).toHaveAttribute('data-title-visible', 'false')
  await expect(heading).toHaveCSS('opacity', '0')
  await expect(page.getByRole('heading', { level: 1, name: 'Озеро', exact: true })).toHaveCount(1)
  expect((await titleEvents(page)).filter(event => event.visible)).toHaveLength(appearanceCount)
  expect(await originalHeading!.evaluate(element => element.isConnected)).toBe(true)
  await expect(stone).toBeFocused()
})
