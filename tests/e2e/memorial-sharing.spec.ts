import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

type ShareMode = 'unsupported' | 'pending' | 'error' | 'cannot-share'
type ClipboardMode = 'ok' | 'denied' | 'missing'
type SharingWindow = Window & {
  shareCalls: ShareData[]
  copiedLinks: string[]
  finishShare?: (error?: string) => void
}
const memorialId = '6276a85b-cd97-43e8-9ef4-f265149c10ec'
const petName = 'Рыжик & Sunny'

async function installSharing(page: Page, mode: ShareMode, clipboard: ClipboardMode = 'ok') {
  await page.addInitScript(({ mode, clipboard }) => {
    const state = window as SharingWindow
    state.shareCalls = []
    state.copiedLinks = []
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => mode !== 'cannot-share' })
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'unsupported' ? undefined : async (data: ShareData) => {
      state.shareCalls.push(data)
      if (mode === 'error') throw new DOMException('Sharing unavailable', 'NotAllowedError')
      if (mode === 'pending') await new Promise<void>((resolve, reject) => {
        state.finishShare = error => error ? reject(new DOMException('Dismissed', error)) : resolve()
      })
    } })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard === 'missing' ? undefined : {
      writeText: async (url: string) => {
        if (clipboard === 'denied') throw new DOMException('Clipboard unavailable', 'NotAllowedError')
        state.copiedLinks.push(url)
      }
    } })
  }, { mode, clipboard })
}

async function fixture(page: Page, story = 'Every quiet evening together is a memory we keep.') {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [{
    source: 'saved', id: memorialId, gardenId: 'lake', place: 3, name: petName, species: 'cat', born: 2012, died: 2024,
    story, creatorName: null, canEdit: false
  }] }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

async function openMemorial(page: Page, locale = 'en', story?: string) {
  await fixture(page, story)
  await visitLocale(page, `/gardens?garden=lake&memorial=${memorialId}&from=account&diagnosticsMode=collect#private-context`, locale)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await expect(page.getByRole('dialog')).toHaveAccessibleName(petName)
}

function publicUrl(page: Page) {
  return `${new URL(page.url()).origin}/gardens?garden=lake&memorial=${memorialId}`
}

async function settledDetail(page: Page) {
  // A viewport change schedules preparation on the next animation frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-detail-state', 'ready')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: return occupies the scene corner and sharing stays in the footer across responsive and expanded views`, async ({ page }, testInfo) => {
    await installSharing(page, 'unsupported')
    await openMemorial(page, locale, 'A quiet memory to keep close. '.repeat(140))
    const detail = page.getByTestId('memorial-detail')
    const back = page.getByTestId('memorial-detail-return')
    const share = page.getByTestId('memorial-share')
    const reading = page.getByTestId('memorial-detail-reading')
    const footer = detail.locator('.memorial-detail-footer')
    const expand = page.getByTestId('memorial-detail-expand')
    await expect(detail.locator('.memorial-detail-place')).toHaveCount(0)
    await expect(page.getByTestId('memorial-detail-close')).toHaveCount(0)
    await expect(back).toBeFocused()
    await expect(back).toHaveAccessibleName(locale === 'ru' ? 'Вернуться в сад' : 'Return to the garden')
    for (const size of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(size)
      await settledDetail(page)
      await expect.poll(() => page.locator('.canvas-host').evaluate(element => element.clientWidth)).toBeGreaterThan(size.width - 60)
      const visual = (await page.getByTestId('memorial-detail-visual').boundingBox())!
      const backBounds = (await back.boundingBox())!
      const controls = (await detail.locator('.memorial-detail-controls').boundingBox())!
      const footerBounds = (await footer.boundingBox())!
      const shareBounds = (await share.boundingBox())!
      expect(backBounds.x).toBeGreaterThanOrEqual(visual.x)
      expect(backBounds.x).toBeLessThanOrEqual(visual.x + 25)
      expect(backBounds.y).toBeGreaterThanOrEqual(visual.y)
      expect(backBounds.y).toBeLessThanOrEqual(visual.y + 25)
      expect(backBounds.x + backBounds.width + 8).toBeLessThanOrEqual(controls.x)
      for (const bounds of [backBounds, shareBounds]) {
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
      }
      expect(shareBounds.width).toBeGreaterThanOrEqual(footerBounds.width - 42)
      expect(shareBounds.y).toBeGreaterThanOrEqual(footerBounds.y)
      expect(shareBounds.y + shareBounds.height).toBeLessThanOrEqual(footerBounds.y + footerBounds.height)
      await reading.evaluate(element => { element.scrollTop = element.scrollHeight })
      expect(await reading.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      expect((await share.boundingBox())!.y).toBeCloseTo(shareBounds.y, 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await reading.evaluate(element => { element.scrollTop = 0 })
      await page.screenshot({ path: testInfo.outputPath(`actions-${locale}-${size.width}.png`), animations: 'disabled', scale: 'css' })
      if (await expand.count()) {
        await expand.click()
        await expect(expand).toHaveAttribute('aria-expanded', 'true')
        await expect.poll(() => back.evaluate(element => {
          const box = element.getBoundingClientRect()
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === element
        })).toBe(true)
        await expect(back).toBeEnabled()
        const identity = (await detail.locator('.memorial-detail-identity').boundingBox())!
        const navigation = (await back.boundingBox())!
        expect(identity.y).toBeGreaterThanOrEqual(navigation.y + navigation.height + 8)
        await page.screenshot({ path: testInfo.outputPath(`actions-${locale}-${size.width}-expanded.png`), animations: 'disabled', scale: 'css' })
        await expand.click()
        await expect(expand).toHaveAttribute('aria-expanded', 'false')
      }
    }
    // The tightest header also fits both scene actions when motion is enabled.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.getByTestId('memorial-detail-motion')).toBeVisible()
    await settledDetail(page)
    await expect(detail.locator('.memorial-detail-controls button')).toHaveCount(2)
    const compactBack = (await back.boundingBox())!
    const allControls = (await detail.locator('.memorial-detail-controls').boundingBox())!
    expect(compactBack.x + compactBack.width + 8).toBeLessThanOrEqual(allControls.x)
    await page.screenshot({ path: testInfo.outputPath(`actions-${locale}-320-all-controls.png`), animations: 'disabled', scale: 'css' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await settledDetail(page)
    await expect(expand).toBeVisible()
    await expand.click()
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(detail).toHaveCount(0)
    await expect(page.getByTestId(`memorial-${memorialId}`)).toBeFocused()
  })

  test(`${locale}: the styled share action copies a clean public link that opens the same memorial for a guest`, async ({ page, context, isMobile }, testInfo) => {
    await installSharing(page, 'unsupported')
    await openMemorial(page, locale)
    const share = page.getByTestId('memorial-share')
    await expect(share).toContainText(locale === 'ru' ? 'Поделиться' : 'Share')
    await expect(share).toHaveAccessibleName(new RegExp(petName))
    await share.scrollIntoViewIfNeeded()
    const bounds = (await share.boundingBox())!
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(await page.locator('.memorial-detail-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`share-${locale}.png`), scale: 'css', animations: 'disabled' })
    const expected = publicUrl(page)
    if (isMobile) await share.tap()
    else {
      await share.focus()
      await page.keyboard.press('Enter')
    }
    await expect.poll(() => page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([expected])
    await expect(page.getByText(locale === 'ru' ? 'Ссылка скопирована' : 'Link copied', { exact: true })).toBeVisible()
    await expect(share).toBeEnabled()
    await expect(page.getByTestId('memorial-detail')).toBeVisible()
    const guest = await context.newPage()
    try {
      await fixture(guest)
      await guest.goto(expected)
      await expect(guest.getByRole('dialog')).toHaveAccessibleName(petName)
      await expect(guest.locator('.memorial-story p')).toHaveText('Every quiet evening together is a memory we keep.')
    } finally { await guest.close() }
  })
}

test('native sharing uses the pet and public place, prevents duplicate requests and treats cancellation silently', async ({ page }) => {
  await installSharing(page, 'pending')
  await openMemorial(page, 'ru')
  const share = page.getByTestId('memorial-share')
  await share.focus()
  await page.keyboard.press('Enter')
  await expect(share).toBeDisabled()
  await expect(share).toHaveAttribute('aria-busy', 'true')
  await share.dispatchEvent('click')
  await expect.poll(() => page.evaluate(() => (window as SharingWindow).shareCalls)).toEqual([{
    url: publicUrl(page), title: `${petName} — PetMemoreal`, text: `Место памяти питомца ${petName} в саду «Озеро».`
  }])
  await page.evaluate(() => (window as SharingWindow).finishShare!())
  await expect(share).toBeEnabled()
  await expect(share).toBeFocused()
  expect(await page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([])
  await share.click()
  await expect(share).toBeDisabled()
  await page.evaluate(() => (window as SharingWindow).finishShare!('AbortError'))
  await expect(share).toBeEnabled()
  await expect(share).toBeFocused()
  expect(await page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([])
  await expect(page.getByText('Ссылка скопирована', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('memorial-share-link')).toHaveCount(0)
  await expect(page.getByTestId('memorial-detail')).toBeVisible()
})

for (const mode of ['error', 'cannot-share'] as const) {
  test(`${mode}: unavailable native sharing falls back to copying the memorial link`, async ({ page }) => {
    await installSharing(page, mode)
    await openMemorial(page)
    await page.getByTestId('memorial-share').click()
    await expect.poll(() => page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([publicUrl(page)])
    await expect(page.getByText('Link copied', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => (window as SharingWindow).shareCalls.length)).toBe(mode === 'error' ? 1 : 0)
  })
}

for (const clipboard of ['denied', 'missing'] as const) {
  test(`${clipboard}: an unavailable clipboard offers a selected accessible link inside the card`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await installSharing(page, 'unsupported', clipboard)
    await openMemorial(page, 'ru')
    const share = page.getByTestId('memorial-share')
    await share.click()
    const input = page.getByRole('textbox', { name: 'Ссылка на место памяти' })
    await expect(input).toHaveValue(publicUrl(page))
    await expect(input).toHaveAttribute('readonly', '')
    await expect(input).toBeFocused()
    await expect(input).toBeInViewport({ ratio: .99 })
    expect(await input.evaluate(element => {
      const field = element as HTMLInputElement
      return field.selectionStart === 0 && field.selectionEnd === field.value.length
    })).toBe(true)
    await expect(input).toHaveAccessibleDescription('Автоматически скопировать не удалось. Скопируйте ссылку из поля.')
    await expect(share).toBeEnabled()
    await expect(page.getByText('Ссылка скопирована', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('memorial-detail')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`share-manual-${clipboard}.png`), scale: 'css', animations: 'disabled' })
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (url: string) => { (window as SharingWindow).copiedLinks.push(url) }
    } }))
    await share.click()
    await expect.poll(() => page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([publicUrl(page)])
    await expect(input).toHaveCount(0)
    await expect(page.getByText('Ссылка скопирована', { exact: true })).toBeVisible()
  })
}

test('leaving the memorial during native sharing does not copy a link after a late failure', async ({ page }) => {
  await installSharing(page, 'pending')
  await openMemorial(page)
  await page.getByTestId('memorial-share').click()
  await expect(page.getByTestId('memorial-share')).toBeDisabled()
  await page.getByTestId('memorial-detail-return').click()
  await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
  await page.evaluate(() => (window as SharingWindow).finishShare!('NotAllowedError'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([])
  await expect(page.getByText('Link copied', { exact: true })).toHaveCount(0)
})

test('a demonstration memorial shares its stable garden and place link', async ({ page }) => {
  await installSharing(page, 'unsupported')
  await fixture(page)
  await visitLocale(page, '/gardens?garden=hill&memorial=hill-1', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Milo')
  await page.getByTestId('memorial-share').click()
  await expect.poll(() => page.evaluate(() => (window as SharingWindow).copiedLinks)).toEqual([
    `${new URL(page.url()).origin}/gardens?garden=hill&memorial=hill-1`
  ])
})
