import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Public layout scenarios use demo places; persisted data is tested separately.
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

const cases = [
  { locale: 'ru', title: 'Любовь остаётся.', question: 'Как создать место памяти?', answer: 'Войдите в аккаунт, выберите сад' },
  { locale: 'en', title: 'Love stays.', question: 'How do I create a memorial?', answer: 'Sign in, choose a garden' }
]

for (const copy of cases) {
  test(`${copy.locale}: discover a garden and follow the closing invitation`, async ({ page }) => {
    await page.goto(`/${copy.locale}`)
    for (const garden of ['meadow', 'lake', 'grove', 'hill']) {
      await expect(page.getByTestId(`discover-${garden}`)).toHaveAttribute('href', `/${copy.locale}/gardens?garden=${garden}`)
    }
    await page.getByTestId('discover-lake').focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/gardens\\?garden=lake$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.locale === 'ru' ? 'Озеро' : 'Lake')
    await page.goto(`/${copy.locale}`)
    await page.locator('.invitation-actions a').first().click()
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/gardens$`))
    await page.goto(`/${copy.locale}`)
    await page.locator('.invitation-actions a').last().click()
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/register$`))
  })

  test(`${copy.locale}: no preview on the landing and creation starts at a free garden place`, async ({ page }, testInfo) => {
    const ru = copy.locale === 'ru'
    await page.goto(`/${copy.locale}`)
    const primary = page.locator('.hero-actions a').first()
    await expect(primary).toHaveAccessibleName(ru ? 'Создать место памяти' : 'Create a memorial')
    await expect(primary).toHaveAttribute('href', `/${copy.locale}/gardens`)
    await page.locator('.hero-actions a').last().click()
    await expect(page).toHaveURL(/#gardens$/)
    await expect(page.getByTestId('discover-meadow')).toBeInViewport()
    await expect(page.locator('#preview, a[href="#preview"], form, input, textarea')).toHaveCount(0)
    await expect(page.getByText(ru ? 'Начать с одного воспоминания' : 'Start with one memory', { exact: true })).toHaveCount(0)
    await expect(page.locator('.demo-note')).toHaveCount(0)
    const copyText = await page.locator('.landing').innerText()
    expect(copyText).not.toMatch(/в разработке|планируем|будущий мир|будущего сада|will be available|we plan|still growing|future garden/i)
    expect(copyText).not.toMatch(/зажгите свечу|оставьте цветок|любимая фотография|light a candle|leave a flower|favourite photo/i)
    const publicQuestion = page.locator('summary').filter({ hasText: ru ? 'Кто увидит историю моего питомца?' : 'Who can read my pet’s story?' })
    await publicQuestion.click()
    await expect(page.getByText(ru ? 'Истории в саду открыты для всех посетителей.' : 'Stories in the garden are open to all visitors.', { exact: false })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('landing-faq.png'), animations: 'disabled' })
    await primary.click()
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/gardens$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ru ? 'Луг' : 'Meadow')
    const freePlace = page.getByTestId('empty-meadow-3')
    await expect(freePlace).toBeEnabled()
    await freePlace.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/login\\?redirect=`))
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(`/${copy.locale}/gardens?garden=meadow&create=3`)
  })

  test(`${copy.locale}: landing, navigation and accessible FAQ`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`/${copy.locale}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(copy.title)
    await expect(page.locator('html')).toHaveAttribute('lang', copy.locale)
    await expect(page).toHaveTitle(/PetMemoreal/)
    const background = page.locator('.hero-background')
    await expect(background).toBeVisible()
    expect(await background.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    const hero = (await page.locator('.hero-section').boundingBox())!
    const art = (await background.boundingBox())!
    expect(Math.abs(hero.width - art.width)).toBeLessThan(1)
    expect(Math.abs(hero.height - art.height)).toBeLessThan(1)
    // Both actions remain inside the first section, including long translated labels.
    for (const action of await page.locator('.hero-actions a').all()) {
      const box = (await action.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(hero.y + hero.height)
      expect(box.x + box.width).toBeLessThanOrEqual(hero.x + hero.width)
    }
    await page.screenshot({ path: testInfo.outputPath('hero.png'), animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true, animations: 'disabled' })
    const question = page.locator('summary').filter({ hasText: copy.question })
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(copy.answer, { exact: false })).toBeVisible()
    expect(errors).toEqual([])
  })

}

test('ambient motion can be paused and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/ru')
  const toggle = page.getByRole('button', { name: 'Остановить движение светлячков' })
  const light = page.locator('.fireflies span').first()
  await expect(light).toHaveCSS('animation-play-state', 'running')
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(light).toHaveCSS('animation-play-state', 'paused')
  await page.keyboard.press('Space')
  await expect(light).toHaveCSS('animation-play-state', 'running')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(toggle).toBeHidden()
  await expect(page.locator('.fireflies')).toBeHidden()
  await expect(page.locator('.hero-copy')).toHaveCSS('animation-name', 'none')
  await page.locator('#how').scrollIntoViewIfNeeded()
  await expect(page.locator('#how')).toHaveCSS('animation-name', 'none')
})

test('language switch opens the translated page', async ({ page }) => {
  await page.goto('/ru')
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click()
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Love stays.')
  await page.getByRole('link', { name: 'Переключить на русский', exact: true }).click()
  await expect(page).toHaveURL(/\/ru$/)
})

for (const copy of cases) {
  test(`${copy.locale}: missing page explains the error and returns home`, async ({ page }) => {
    const response = await page.goto(`/${copy.locale}/missing-page`)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.locale === 'ru' ? 'Эта тропинка никуда не ведёт' : 'This path leads nowhere')
    await page.getByRole('link', { name: copy.locale === 'ru' ? 'На главную' : 'Back to the garden', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(copy.title)
  })
}
