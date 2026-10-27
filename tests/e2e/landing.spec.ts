import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'

const cases = [
  { locale: 'ru', title: 'Любовь остаётся.', question: 'Как создать место памяти?', answer: 'Войдите в аккаунт, выберите сад' },
  { locale: 'en', title: 'Love stays.', question: 'How do I create a memorial?', answer: 'Sign in, choose a garden' }
]

for (const copy of cases) {
  test(`${copy.locale}: the static landing shows every answer without account requests or moving controls`, async ({ page }, testInfo) => {
    const errors: string[] = []
    const accountRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (/^\/api\/(auth(?:\/|$)|me$|memorials(?:\/|$)|gardens(?:\/|$))/.test(path)) accountRequests.push(path)
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await visitLocale(page, `/`, copy.locale)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(copy.title)
    await expect(page.locator('html')).toHaveAttribute('lang', copy.locale)
    await expect(page).toHaveTitle(/PetMemoreal/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /PetMemoreal/)
    await expect(page.locator('form, input, textarea, button, details, summary, canvas, .motion-toggle, .fireflies, [data-reveal], [data-testid="landing-sign-out"]')).toHaveCount(0)
    const answers = page.locator('.faq-list article')
    await expect(answers).toHaveCount(4)
    for (const answer of await answers.all()) {
      await expect(answer.getByRole('heading', { level: 3 })).toBeVisible()
      await expect(answer.locator('p')).toBeVisible()
    }
    await expect(page.getByRole('heading', { level: 3, name: copy.question, exact: true })).toBeVisible()
    await expect(page.getByText(copy.answer, { exact: false })).toBeVisible()
    for (const garden of ['meadow', 'lake', 'grove', 'hill']) {
      const card = page.getByTestId(`discover-${garden}`)
      await expect(card).toBeVisible()
      await expect(card).toHaveJSProperty('tagName', 'ARTICLE')
      await expect(card.locator('a, button')).toHaveCount(0)
    }
    const text = await page.locator('.landing').innerText()
    expect(text).not.toMatch(/в разработке|планируем|будущий мир|будущего сада|will be available|we plan|still growing|future garden/i)
    expect(text).not.toMatch(/зажгите свечу|оставьте цветок|любимая фотография|light a candle|leave a flower|favourite photo/i)
    const background = page.locator('.hero-background')
    await expect(background).toBeVisible()
    expect(await background.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    const hero = (await page.locator('.hero-section').boundingBox())!
    const art = (await background.boundingBox())!
    expect(Math.abs(hero.width - art.width)).toBeLessThan(1)
    expect(Math.abs(hero.height - art.height)).toBeLessThan(1)
    for (const action of await page.locator('.hero-actions a').all()) {
      const box = (await action.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(hero.y + hero.height)
      expect(box.x + box.width).toBeLessThanOrEqual(hero.x + hero.width)
    }
    // Hovering a visible action must not prefetch a personalized destination.
    await page.locator('.hero-actions a').first().hover()
    await page.locator('#how').scrollIntoViewIfNeeded()
    const moving = await page.locator('.landing').evaluate(element => {
      return element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.playState === 'running').length
    })
    expect(moving).toBe(0)
    expect(accountRequests).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true })
    expect(errors).toEqual([])
  })

  test(`${copy.locale}: one garden row, vertical steps and a fixed back-to-top link`, async ({ page }, testInfo) => {
    await visitLocale(page, `/`, copy.locale)
    await expect(page.getByTestId('back-to-top')).toBeHidden()
    await expect(page.locator('.promise-strip, .steps-grid, .values-grid')).toHaveCount(0)
    await expect(page.locator('.garden-doors > article')).toHaveCount(4)
    await expect(page.locator('.journey-list > li')).toHaveCount(3)
    await expect(page.locator('.values-message > h2')).toBeVisible()
    const steps = await page.locator('.journey-list > li').all()
    const boxes = await Promise.all(steps.map(step => step.boundingBox()))
    for (let index = 1; index < boxes.length; index++) {
      expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height - 1)
      expect(boxes[index]!.x).toBeCloseTo(boxes[0]!.x, 0)
    }
    const back = page.getByTestId('back-to-top')
    await page.mouse.wheel(0, 200)
    await expect(back).toBeVisible()
    await expect(back).toHaveAccessibleName(copy.locale === 'ru' ? 'Наверх' : 'Back to top')
    await expect(back).toHaveAttribute('href', '#top')
    await expect(back).toHaveCSS('position', 'fixed')
    await expect(page.locator('footer a[href="#top"]')).toHaveCount(0)
    const initial = (await back.boundingBox())!
    const viewport = page.viewportSize()!
    expect(initial.width).toBeGreaterThanOrEqual(44)
    expect(initial.height).toBeGreaterThanOrEqual(44)
    expect(viewport.width - initial.x - initial.width).toBeGreaterThanOrEqual(12)
    expect(viewport.height - initial.y - initial.height).toBeGreaterThanOrEqual(12)
    await page.locator('#how').screenshot({ path: testInfo.outputPath('landing-journey.png') })
    await page.locator('.values-section').screenshot({ path: testInfo.outputPath('landing-values.png') })
    await page.locator('footer').scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200)
    const scrolled = (await back.boundingBox())!
    expect(scrolled.x).toBeCloseTo(initial.x, 0)
    expect(scrolled.y).toBeCloseTo(initial.y, 0)
    await back.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2)
    await expect(back).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/#top$`))
    await visitLocale(page, `/#questions`, copy.locale)
    await expect(back).toBeVisible()
    await back.click()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2)
    await expect(back).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test(`${copy.locale}: constant landing links lead a guest to registration or sign in`, async ({ page }) => {
    await visitLocale(page, `/`, copy.locale)
    const primary = page.locator('.hero-actions a').first()
    const secondary = page.locator('.hero-actions a').last()
    await expect(primary).toHaveAccessibleName(copy.locale === 'ru' ? 'Создать место памяти' : 'Create a memorial')
    await expect(primary).toHaveAttribute('href', `/register`)
    await expect(secondary).toHaveAttribute('href', `/login`)
    await expect(page.locator('.auth-header-login')).toHaveAttribute('href', `/login`)
    await expect(page.locator('.header-cta')).toHaveAttribute('href', `/register`)
    for (const action of await page.locator('.invitation-actions a').all()) {
      await expect(action).toHaveAttribute('href', `/register`)
    }
    await primary.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/register$`))
    await expect(page.locator('.auth-form')).toBeVisible()
    await page.goBack()
    await secondary.click()
    await expect(page).toHaveURL(new RegExp(`/login$`))
    await expect(page.locator('.auth-form')).toBeVisible()
    await page.goBack()
    await page.locator('.invitation-actions a').first().click()
    await expect(page).toHaveURL(new RegExp(`/register$`))
  })
}

test.describe('server-rendered landing', () => {
  test.use({ javaScriptEnabled: false })

  for (const copy of cases) {
    test(`${copy.locale}: all content and ordinary navigation work with JavaScript disabled`, async ({ page }, testInfo) => {
      await visitLocale(page, `/`, copy.locale)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(copy.title)
      await expect(page.locator('.garden-doors article')).toHaveCount(4)
      await expect(page.locator('.faq-list article p')).toHaveCount(4)
      for (const answer of await page.locator('.faq-list article p').all()) await expect(answer).toBeVisible()
      await expect(page.getByText(copy.answer, { exact: false })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('landing-without-javascript.png'), fullPage: true })
      await page.locator('footer').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('back-to-top')).toBeHidden()
      await page.locator('.hero-actions a').first().click()
      await expect(page).toHaveURL(new RegExp(`/register$`))
      await expect(page.locator('.auth-form')).toBeVisible()
    })
  }
})

test('language switch opens the translated static page', async ({ page }) => {
  await visitLocale(page, '/', 'ru')
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Love stays.')
  await page.getByRole('link', { name: 'Переключить на русский', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

for (const copy of cases) {
  test(`${copy.locale}: missing page explains the error and returns home`, async ({ page }) => {
    const response = await visitLocale(page, `/missing-page`, copy.locale)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.locale === 'ru' ? 'Эта тропинка никуда не ведёт' : 'This path leads nowhere')
    await page.getByRole('link', { name: copy.locale === 'ru' ? 'На главную' : 'Back to the garden', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(copy.title)
  })
}
