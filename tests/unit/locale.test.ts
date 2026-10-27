import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAuthRedirect as authRedirect, resolveVisitorLocale, safeLocaleReturnPath, withoutLocalePrefix } from '../../shared/locale'

test('country selects Russian only for Russia, regardless of browser language', () => {
  for (const country of ['RU', 'ru', ' RU ']) assert.equal(resolveVisitorLocale(country), 'ru')
  for (const country of ['US', 'BY', 'KZ', 'DE', '', undefined, 'unknown']) assert.equal(resolveVisitorLocale(country), 'en')
  assert.equal(resolveVisitorLocale('RU', 'en'), 'en')
  assert.equal(resolveVisitorLocale('US', 'ru'), 'ru')
  assert.equal(resolveVisitorLocale('RU', 'invalid'), 'ru')
})

test('old locale paths lose only the leading locale and retain memorial queries', () => {
  assert.equal(withoutLocalePrefix('/ru'), '/')
  assert.equal(withoutLocalePrefix('/en/gardens?garden=lake&memorial=123'), '/gardens?garden=lake&memorial=123')
  assert.equal(withoutLocalePrefix('/en#gardens'), '/#gardens')
  assert.equal(withoutLocalePrefix('/english'), '/english')
})

test('language and auth redirects stay local and accept unprefixed garden links', () => {
  assert.equal(safeLocaleReturnPath('/gardens?garden=lake&create=3#place'), '/gardens?garden=lake&create=3#place')
  assert.equal(safeLocaleReturnPath('/en/account'), '/account')
  for (const path of ['//evil.test', 'https://evil.test', '/\\evil.test', '/en//evil.test', '/api/auth/sign-out', '/language?locale=en', '/\n/evil.test', ['/', '//evil.test']]) {
    assert.equal(safeLocaleReturnPath(path), '/')
  }
  assert.equal(authRedirect('/gardens?garden=lake&create=3'), '/gardens?garden=lake&create=3')
  assert.equal(authRedirect('/ru/memorials/new'), '/memorials/new')
  assert.equal(authRedirect('//evil.test'), undefined)
  assert.equal(authRedirect('/account'), undefined)
})
