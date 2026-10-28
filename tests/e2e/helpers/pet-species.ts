import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function choosePetSpecies(page: Page, locale: string, label: string, keyboard = false) {
  const field = page.getByTestId('memorial-species')
  if (keyboard) { await field.focus(); await page.keyboard.press('Enter') }
  else await field.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  const search = page.getByPlaceholder(locale === 'ru' ? 'Найти животное' : 'Find an animal', { exact: true })
  await search.fill(label)
  const option = page.getByRole('option', { name: label, exact: true })
  await expect(option).toBeVisible()
  if (keyboard) { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter') }
  else await option.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(field).toContainText(label)
}
