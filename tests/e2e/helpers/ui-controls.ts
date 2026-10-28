import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

export async function expectModestCorners(control: Locator, maximum = 10, minimum = 4) {
  const radii = await control.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(Number.parseFloat)
  })
  for (const radius of radii) {
    expect(radius).toBeGreaterThanOrEqual(minimum)
    expect(radius).toBeLessThanOrEqual(maximum)
  }
}

export async function expectCompactFocus(control: Locator) {
  await control.evaluate(element => (element as HTMLElement).blur())
  const resting = await control.evaluate(element => {
    const style = getComputedStyle(element)
    return { shadow: style.boxShadow, border: style.borderColor }
  })
  // Establish keyboard modality so button focus-visible styles are exercised too.
  await control.page().keyboard.press('Tab')
  await control.focus()
  await expect(control).toBeFocused()
  const focus = await control.evaluate((element) => {
    const style = getComputedStyle(element)
    const width = style.outlineStyle === 'none' ? 0 : Number.parseFloat(style.outlineWidth)
    return { width, extent: Math.max(0, width + Number.parseFloat(style.outlineOffset)), shadow: style.boxShadow, border: style.borderColor, outline: style.outline }
  })
  expect(focus.width, JSON.stringify(focus)).toBeLessThanOrEqual(2)
  expect(focus.extent).toBeLessThanOrEqual(4)
  expect(focus.width > 0 || focus.shadow !== resting.shadow || focus.border !== resting.border).toBe(true)
}

export async function expectFieldTextSeparated(field: Locator) {
  const geometry = await field.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const formField = element.closest('[data-slot="root"]')?.parentElement
    const label = Array.from(document.querySelectorAll('label')).find(item => item.htmlFor === element.id)
    const errorId = (element.getAttribute('aria-describedby') || '').split(' ').find(id => id.endsWith('-error'))
    const error = errorId ? document.getElementById(errorId) : formField?.querySelector('[data-slot="error"]')
    return { fieldTop: bounds.top, fieldBottom: bounds.bottom, labelBottom: label?.getBoundingClientRect().bottom, errorTop: error?.getBoundingClientRect().top }
  })
  expect(geometry.labelBottom).toBeDefined()
  expect(geometry.labelBottom!).toBeLessThanOrEqual(geometry.fieldTop - 2)
  if (geometry.errorTop !== undefined) expect(geometry.errorTop).toBeGreaterThanOrEqual(geometry.fieldBottom + 2)
}
