import { expect, test } from '@playwright/test'

for (const [country, language] of [['RU', 'ru'], ['US', 'en'], ['BY', 'en'], ['', 'en']] as const) {
  test(`${country || 'unknown'}: country selects ${language} on the server and during hydration without changing the URL`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-vercel-ip-country': country, 'accept-language': language === 'ru' ? 'en-US' : 'ru-RU' } })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const html = await context.request.get('/')
      expect(html.status()).toBe(200)
      expect(html.headers()['cache-control']).toContain('private')
      expect(html.headers()['cache-control']).toContain('no-store')
      expect(await html.text()).toContain(`lang="${language}"`)
      await page.goto('/')
      await expect(page).toHaveURL(`${baseURL}/`)
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await expect(page.locator('#hero-title')).toContainText(language === 'ru' ? 'Любовь остаётся.' : 'Love stays.')
      await page.locator('.hero-actions a').first().click()
      await expect(page).toHaveURL(`${baseURL}/register`)
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}

test('manual language choice persists across navigation and reload, including a garden query', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ 'x-vercel-ip-country': 'RU' })
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.goto('/gardens?garden=lake&memorial=lake-1#garden-main')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.getByTestId('memorial-detail-return').click()
  await page.locator('.language-link').click()
  await expect(page).toHaveURL(/\/gardens\?garden=lake&memorial=lake-1#garden-main$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('/login')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.locator('.language-link').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
})

test('legacy links retain query parameters while removing the locale prefix', async ({ request }) => {
  for (const prefix of ['ru', 'en']) {
    const response = await request.get(`/${prefix}/gardens?garden=lake&memorial=lake-1`, { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe('/gardens?garden=lake&memorial=lake-1')
    expect(response.headers()['cache-control']).toContain('no-store')
    const home = await request.get(`/${prefix}`, { maxRedirects: 0 })
    expect(home.headers().location).toBe('/')
  }
})

test('language links work with JavaScript disabled and cannot redirect to an external site', async ({ browser, baseURL, request }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, extraHTTPHeaders: { 'x-vercel-ip-country': 'RU' } })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.locator('.language-link').click()
    await expect(page).toHaveURL(`${baseURL}/`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.locator('.hero-actions a').first().click()
    await expect(page).toHaveURL(`${baseURL}/register`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  } finally {
    await context.close()
  }
  for (const returnTo of ['https://evil.test', '//evil.test', '/\\evil.test', '/en//evil.test', '/language?locale=ru']) {
    const response = await request.get('/language', { params: { locale: 'en', returnTo }, maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toBe('/')
  }
  expect((await request.get('/language?locale=de', { maxRedirects: 0 })).status()).toBe(400)
})
