import { expect, test } from '@playwright/test'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

for (const locale of ['ru', 'en']) {
  test(`${locale}: the garden overview has four tiles, selection works with touch and keyboard, and Back restores the overview`, async ({ page }, testInfo) => {
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/gardens/*/memorials', (route) => {
      requests.push(route.request().url())
      return route.fulfill({ json: [] })
    })
    await page.goto(`/${locale}/gardens`)
    const title = page.getByRole('heading', { level: 1 })
    const overviewTitle = locale === 'ru' ? 'Четыре тихих сада' : 'Four quiet gardens'
    await expect(title).toHaveText(overviewTitle)
    await expect(title).toHaveClass('sr-only')
    await expect(page.locator('.garden-hud, .garden-title')).toHaveCount(0)
    const header = page.getByTestId('garden-header')
    await expect(header).toBeVisible()
    await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
    await expect(page.locator('.camera-toolbar, .garden-paths, .memorial-controls')).toHaveCount(0)
    const boxes = []
    for (const garden of gardens) {
      const tile = page.getByTestId(`garden-choice-${garden}`)
      await expect(tile).toBeInViewport()
      boxes.push((await tile.boundingBox())!)
    }
    // The restored overview is a 2x2 canvas, including on phones.
    expect(boxes[0]!.y).toBeCloseTo(boxes[1]!.y, 0)
    expect(boxes[2]!.y).toBeCloseTo(boxes[3]!.y, 0)
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width)
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height)
    expect(boxes[0]!.y).toBeGreaterThan((await header.boundingBox())!.y + (await header.boundingBox())!.height)
    expect(requests).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('garden-selection.png'), animations: 'disabled' })
    const lake = page.getByTestId('garden-choice-lake')
    if (testInfo.project.name === 'mobile') await lake.tap()
    else await lake.click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=lake$`))
    await expect(title).toHaveText(locale === 'ru' ? 'Озеро' : 'Lake')
    await expect(title).toBeFocused()
    await expect(header).toBeVisible()
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await expect(page.getByTestId('garden-choices')).toHaveCount(0)
    await page.goBack()
    await expect(title).toHaveText(overviewTitle)
    await expect(page.locator('canvas')).toHaveCount(1)
    const grove = page.getByTestId('garden-choice-grove')
    await grove.focus()
    await expect(grove).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=grove$`))
    await page.reload()
    await expect(title).toHaveText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.locator('.memorial-hit')).toHaveCount(16)
    await page.getByTestId('garden-switch').click()
    await page.getByTestId('garden-overview').click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/gardens$`))
    await expect(title).toHaveText(overviewTitle)
    await expect(title).toBeFocused()
    await expect(page.getByTestId('garden-choices')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    expect(errors).toEqual([])
  })

  test(`${locale}: each overview tile opens its own garden, while direct memorial links bypass selection`, async ({ page }) => {
    await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
    for (const garden of gardens) {
      await page.goto(`/${locale}/gardens`)
      await page.getByTestId(`garden-choice-${garden}`).click()
      await expect(page).toHaveURL(new RegExp(`/${locale}/gardens\\?garden=${garden}$`))
      await expect(page.getByTestId(`memorial-${garden}-1`)).toBeVisible()
    }
    await page.goto(`/${locale}/gardens?garden=lake&memorial=lake-1`)
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('garden-choices')).toHaveCount(0)
  })
}
