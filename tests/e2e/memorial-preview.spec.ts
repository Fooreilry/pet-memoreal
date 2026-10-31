import { clickGardenControl } from './helpers/garden-controls'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'
import { revealMemorialMarker } from './helpers/memorial'

async function activate(target: Locator, touch: boolean) {
  if (await target.evaluate(element => element.classList.contains('memorial-hit'))) await revealMemorialMarker(target)
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
  test(`${locale}: phone previews stay compact while keeping the full story one action away`, async ({ page, isMobile }, testInfo) => {
    const id = 'c6450232-339c-4c54-a7ba-506a90c6e7cb'
    const name = (locale === 'ru' ? 'Наш любимый маленький солнечный друг ' : 'Our beloved little companion in the sunshine ').repeat(3).slice(0, 80)
    const storyText = (locale === 'ru' ? 'Мы помним наши прогулки и тихие вечера рядом. ' : 'We remember our walks and the quiet evenings together. ').repeat(40)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/gardens/lake/memorials', route => route.fulfill({ json: [{
      source: 'saved', id, gardenId: 'lake', place: 2, name, species: 'cat', born: 2012, died: 2024,
      story: storyText, creatorName: null, canEdit: false
    }] }))
    await visitLocale(page, '/gardens?garden=lake', locale)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const stone = page.getByTestId(`memorial-${id}`)
    await stone.focus()
    await activate(stone, isMobile)
    const summary = page.getByTestId('memorial-summary')
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(size)
      await expectCardInsideWindow(page)
      await expect(summary).toHaveAccessibleName(new RegExp(name))
      const bounds = (await summary.boundingBox())!
      expect(bounds.width).toBeLessThanOrEqual(251)
      expect(bounds.height).toBeLessThanOrEqual(280)
      for (const text of [summary.locator('strong'), summary.locator('.memorial-summary-quote')]) {
        expect(await text.evaluate(element => element.clientHeight <= Number.parseFloat(getComputedStyle(element).lineHeight) * 2 + 1)).toBe(true)
      }
      expect(await summary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect((await summary.locator('.memorial-summary-action').boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: testInfo.outputPath(`compact-preview-${locale}-${size.width}.png`), animations: 'disabled', scale: 'css' })
    }
    await activate(summary, isMobile)
    await expect(storyDialog(page)).toHaveAccessibleName(name)
    await expect(storyDialog(page).locator('.memorial-story p')).toHaveText(storyText)
    await expect(summary).toHaveCount(0)
  })

  test(`${locale}: a stone opens a short card first and every story close action leaves the short card closed`, async ({ page, isMobile }, testInfo) => {
    test.slow()
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
      await revealMemorialMarker(stone)
      await stone.hover()
      await page.waitForTimeout(250)
      await expect(summary).toHaveCount(0)
      await expect(story).toHaveCount(0)
    }

    for (const close of ['return', 'escape']) {
      await revealMemorialMarker(stone)
      await expect(stone).toBeInViewport()
      await activate(stone, isMobile)
      await expect(summary).toContainText(name)
      await expect(summary).toContainText('2011 — 2023')
      const preview = page.getByRole('dialog').filter({ has: summary })
      await expect(preview).toHaveAccessibleName(new RegExp(name))
      await expect(preview).not.toHaveAttribute('aria-modal', 'true')
      await expect(story).toHaveCount(0)
      await expectCardInsideWindow(page)
      if (close === 'return') await page.screenshot({ path: testInfo.outputPath(`preview-${locale}.png`), scale: 'css', animations: 'disabled' })

      await activate(summary, isMobile)
      await expect(story).toHaveAccessibleName(name)
      await expect(story).toContainText(locale === 'ru' ? 'Наша история' : 'Our story')
      await expect(summary).toHaveCount(0)
      if (close === 'return') await story.getByRole('button', { name: locale === 'ru' ? 'Вернуться в сад' : 'Return to the garden', exact: true }).click()
      else await page.keyboard.press('Escape')

      await expect(story).toHaveCount(0)
      await expect(stone).toBeFocused()
      // Focus restoration and the pointer left over the trigger must not reopen
      // the short card. A new deliberate activation opens it on the next loop.
      await page.waitForTimeout(300)
      await expect(summary).toHaveCount(0)
    }
  })

  test(`${locale}: long saved stories remain readable without hiding their author, edit action or dismiss controls`, async ({ page, isMobile }, testInfo) => {
    const id = 'f0450ee2-6f73-4f12-9b25-1ac673603882'
    const name = (locale === 'ru' ? 'Наш любимый маленький солнечный друг ' : 'Our beloved little companion in the sunshine ').repeat(3).slice(0, 80)
    const paragraph = locale === 'ru'
      ? 'Мы помним ваши любимые тропинки и долгие тихие вечера рядом. '
      : 'We remember your favorite paths and all the quiet evenings we spent together. '
    const storyText = Array.from({ length: 80 }, () => paragraph).join('\n\n').slice(0, 5000)
    const creatorName = locale === 'ru' ? null : 'Alex'
    await page.route('**/api/gardens/lake/memorials', route => route.fulfill({ json: [{
      source: 'saved', id, gardenId: 'lake', place: 2, name, species: 'cat', born: 2012, died: 2024,
      story: storyText, creatorName, canEdit: true
    }] }))
    await visitLocale(page, '/gardens?garden=lake', locale)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const stone = page.getByTestId(`memorial-${id}`)
    await stone.focus()
    await activate(stone, isMobile)
    const summary = page.getByTestId('memorial-summary')
    await expect(summary).toContainText(name)
    await expect(summary).toContainText(locale === 'ru' ? 'Читать историю' : 'Read the story')
    await expectCardInsideWindow(page)
    const excerpt = summary.locator('.memorial-summary-quote')
    expect(await excerpt.evaluate(element => element.clientHeight <= Number.parseFloat(getComputedStyle(element).lineHeight) * 3 + 1)).toBe(true)
    await activate(summary, isMobile)
    const story = storyDialog(page)
    await expect(story).toHaveAccessibleName(name)
    await expect(story.locator('.memorial-story p')).toHaveText(storyText)
    await expect(story.getByTestId('memorial-creator')).toContainText(creatorName ?? 'Анонимно')
    const edit = story.getByTestId('memorial-edit')
    await expect(edit).toHaveText(locale === 'ru' ? 'Изменить' : 'Edit')
    await expect(edit).toHaveAttribute('href', `/memorials/${id}/edit`)
    const share = page.getByTestId('memorial-share')
    const back = story.getByRole('button', { name: locale === 'ru' ? 'Вернуться в сад' : 'Return to the garden', exact: true })
    const body = page.getByTestId('memorial-detail-reading')
    await expect(share).toBeInViewport()
    await expect(back).toBeInViewport()
    await story.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
    if ((await page.locator('.garden-stage').boundingBox())!.width < 760) {
      const visual = (await page.getByTestId('memorial-detail-visual').boundingBox())!
      const panel = (await story.locator('.memorial-detail-panel').boundingBox())!
      expect(visual.height).toBeGreaterThanOrEqual(180)
      expect(visual.height).toBeLessThanOrEqual(340)
      expect(panel.y).toBeGreaterThan(visual.y + visual.height)
      await expect(page.getByTestId('memorial-detail-expand')).toHaveAttribute('aria-expanded', 'false')
    }
    const initialBack = (await back.boundingBox())!
    expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await story.locator('.memorial-story p').evaluate(element => getComputedStyle(element).fontSize)).toBe('16px')
    await body.evaluate(element => { element.scrollTop = element.scrollHeight })
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect((await back.boundingBox())!.y).toBeCloseTo(initialBack.y, 0)
    await expect(share).toBeInViewport()
    await expect(back).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`saved-story-${locale}.png`), scale: 'css', animations: 'disabled' })
    await back.click()
    await expect(story).toHaveCount(0)
    await expect(summary).toHaveCount(0)
    await expect(stone).toBeFocused()

    // Landscape phones keep the header/footer reachable while only the long body scrolls.
    await page.setViewportSize({ width: 844, height: 390 })
    await stone.focus()
    await activate(stone, isMobile)
    await expectCardInsideWindow(page)
    await activate(summary, isMobile)
    await expect(story).toHaveAccessibleName(name)
    await expect(share).toBeInViewport()
    await expect(back).toBeInViewport()
    await back.click()
    await expect(story).toHaveCount(0)
    await expect(summary).toHaveCount(0)
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
  await page.getByTestId('memorial-detail-return').click()
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
  await clickGardenControl(page, 'garden-fullscreen')
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
