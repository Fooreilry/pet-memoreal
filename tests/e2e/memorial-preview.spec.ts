import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

async function activate(target: Locator, touch: boolean) {
  if (touch) await target.tap()
  else await target.click()
}

function storyDialog(page: Page) {
  return page.getByRole('dialog').filter({ has: page.locator('.memorial-details') })
}

async function openGarden(page: Page) {
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
}

async function expectCardInsideWindow(page: Page) {
  const card = page.getByTestId('memorial-summary')
  await expect(card).toBeVisible()
  await expect.poll(async () => {
    const bounds = await card.boundingBox()
    const viewport = page.viewportSize()!
    return !!bounds && bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1
  }).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: a stone opens a short card first and every story close action leaves that card closed`, async ({ page, isMobile }, testInfo) => {
    await visitLocale(page, '/gardens?garden=lake', locale)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const stone = page.getByTestId('memorial-lake-1')
    const summary = page.getByTestId('memorial-summary')
    const story = storyDialog(page)
    const name = locale === 'ru' ? 'Мило' : 'Milo'

    if (isMobile) {
      expect(await page.evaluate(() => matchMedia('(any-hover: hover)').matches)).toBe(false)
      // Phones may emit compatibility mouse events, but those must not open
      // a hover card before the user deliberately taps the stone.
      await stone.hover()
      await page.waitForTimeout(250)
      await expect(summary).toHaveCount(0)
      await expect(story).toHaveCount(0)
    }

    for (const close of ['cross', 'return', 'escape']) {
      await expect(stone).toBeInViewport()
      await activate(stone, isMobile)
      await expect(summary).toContainText(name)
      await expect(summary).toContainText('2011 — 2023')
      const preview = page.getByRole('dialog').filter({ has: summary })
      await expect(preview).toHaveAccessibleName(new RegExp(name))
      await expect(preview).not.toHaveAttribute('aria-modal', 'true')
      await expect(story).toHaveCount(0)
      await expectCardInsideWindow(page)
      if (close === 'cross') await page.screenshot({ path: testInfo.outputPath(`preview-${locale}.png`), scale: 'css', animations: 'disabled' })

      await activate(summary, isMobile)
      await expect(story).toHaveAccessibleName(name)
      await expect(story).toContainText(locale === 'ru' ? 'Наша история' : 'Our story')
      await expect(summary).toHaveCount(0)
      if (close === 'cross') await story.getByRole('button', { name: locale === 'ru' ? 'Закрыть историю' : 'Close story', exact: true }).click()
      else if (close === 'return') await story.getByRole('button', { name: locale === 'ru' ? 'Вернуться в сад' : 'Return to the garden', exact: true }).click()
      else await page.keyboard.press('Escape')

      await expect(story).toHaveCount(0)
      await expect(stone).toBeFocused()
      // Focus restoration and the pointer left over the trigger must not reopen
      // the short card. A new deliberate activation opens it on the next loop.
      await page.waitForTimeout(300)
      await expect(summary).toHaveCount(0)
    }
  })
}

test('mouse users can cross from a hovered stone onto its short card and click the card to read the story', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Hover is exercised with an actual mouse')
  await openGarden(page)
  const stone = page.getByTestId('memorial-lake-1')
  const summary = page.getByTestId('memorial-summary')
  await stone.hover()
  await expect(summary).toContainText('Milo')
  await expect(storyDialog(page)).toHaveCount(0)
  const card = (await summary.boundingBox())!
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2, { steps: 8 })
  await page.waitForTimeout(350)
  await expect(summary).toBeVisible()
  await summary.click()
  await expect(storyDialog(page)).toHaveAccessibleName('Milo')
  await expect(summary).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(storyDialog(page)).toHaveCount(0)
  await expect(summary).toHaveCount(0)
  await page.mouse.move(2, 2)
  await stone.hover()
  await expect(summary).toContainText('Milo')
  await page.mouse.move(2, 2)
  await expect(summary).toHaveCount(0)
  // A quick sweep over another marker must not cancel the first marker's
  // pending dismissal and leave its old card stranded on the map.
  await stone.hover()
  await expect(summary).toContainText('Milo')
  const other = (await page.getByTestId('memorial-lake-10').boundingBox())!
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2)
  await page.mouse.move(2, 2)
  await expect(summary).toHaveCount(0)
})

test('another stone replaces the short card, outside input dismisses it and resized cards stay on screen', async ({ page, isMobile }) => {
  await openGarden(page)
  const first = page.getByTestId('memorial-lake-1')
  const last = page.getByTestId('memorial-lake-10')
  const summary = page.getByTestId('memorial-summary')
  await activate(first, isMobile)
  await expect(summary).toContainText('Milo')
  await activate(last, isMobile)
  await expect(summary).toHaveCount(1)
  await expect(summary).toContainText('Luna')
  await expect(storyDialog(page)).toHaveCount(0)
  if (isMobile) await page.touchscreen.tap(2, 2)
  else await page.mouse.click(2, 2)
  await expect(summary).toHaveCount(0)

  await page.getByTestId('garden-zoom-in').click()
  await first.focus()
  await expect(first).toBeInViewport()
  await activate(first, isMobile)
  await expectCardInsideWindow(page)
  await page.setViewportSize({ width: 844, height: 390 })
  await expectCardInsideWindow(page)
  await activate(summary, isMobile)
  await expect(storyDialog(page)).toHaveAccessibleName('Milo')
})

test('keyboard activation uses the short card and Escape closes it before restoring the expanded map', async ({ page }) => {
  await openGarden(page)
  await page.getByTestId('garden-fullscreen').click()
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  const stone = page.getByTestId('memorial-lake-1')
  const summary = page.getByTestId('memorial-summary')
  await stone.focus()
  await page.keyboard.press('Enter')
  await expect(summary).toBeVisible()
  await expect(summary).toBeFocused()
  await expect(storyDialog(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(storyDialog(page)).toHaveAccessibleName('Milo')
  await page.keyboard.press('Escape')
  await expect(storyDialog(page)).toHaveCount(0)
  await expect(summary).toHaveCount(0)
  await expect(stone).toBeFocused()
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  await page.keyboard.press('Space')
  await expect(summary).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(summary).toHaveCount(0)
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'false')
})

test('dragging a stone dismisses the short card and never opens the full story', async ({ page, context, isMobile }) => {
  await openGarden(page)
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  await activate(stone, isMobile)
  await expect(page.getByTestId('memorial-summary')).toBeVisible()
  const bounds = (await stone.boundingBox())!
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
  if (isMobile) {
    const input = await context.newCDPSession(page)
    try {
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      for (const delta of [12, 28, 48]) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - delta, y: y + delta / 3, id: 1 }] })
      await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } finally { await input.detach() }
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 48, y + 16, { steps: 6 })
    await page.mouse.up()
  }
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  await expect(storyDialog(page)).toHaveCount(0)
  // The synthetic click guard expires, after which a fresh input is usable.
  await page.waitForTimeout(400)
  await stone.focus()
  await activate(stone, isMobile)
  await expect(page.getByTestId('memorial-summary')).toBeVisible()
  await activate(page.getByTestId('memorial-summary'), isMobile)
  await expect(storyDialog(page)).toHaveAccessibleName('Milo')
})
