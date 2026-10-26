import { expect, test } from 'vitest'
import { isBlank, normalizeName, normalizeNumber, stripInvisible } from './normalize'

// Invisible and look-alike characters are written as escapes so the row says exactly what it holds.
const numberRows = [
  { id: 'CR-5', name: 'plain space ignored', a: '1234 567', b: '1234567', equal: true },
  { id: 'CR-5', name: 'NBSP ignored', a: '1234 567', b: '1234567', equal: true },
  { id: 'CR-5', name: 'narrow NBSP ignored', a: '1234 567', b: '1234567', equal: true },
  { id: 'CR-5', name: 'several spaces ignored', a: '1 234 567', b: '1234567', equal: true },
  { id: 'CR-5', name: 'zero-width space ignored', a: '1234567​', b: '1234567', equal: true },
  { id: 'CR-5', name: 'tab and line break ignored', a: '1234\t567\n', b: '1234567', equal: true },
  { id: 'CR-5', name: 'word joiner and soft hyphen ignored', a: '12⁠34­567', b: '1234567', equal: true },
  { id: 'CR-4', name: 'leading zeros count: "004" vs "4"', a: '004', b: '4', equal: false },
  { id: 'CR-4', name: 'leading zero kept: "01234" = "01234"', a: '01234', b: '01234', equal: true },
  { id: 'CR-5', name: 'hyphen is a difference', a: '1234-567', b: '1234567', equal: false },
  { id: 'CR-5', name: 'letter O is not zero', a: 'O1234', b: '01234', equal: false },
  { id: 'CR-5', name: 'full-width digits differ', a: '１２３４', b: '1234', equal: false },
]

test.each(numberRows)('$id $name', ({ a, b, equal }) => {
  expect(normalizeNumber(a) === normalizeNumber(b)).toBe(equal)
})

test('CR-4 normalizeNumber keeps a string with its leading zeros', () => {
  expect(normalizeNumber(' 004 ')).toBe('004')
  expect(normalizeNumber('01234')).toBe('01234')
})

const nameRows = [
  { id: 'CR-6', name: 'case, outer and inner spaces', a: '  acme   SUPPLY ltd ', b: 'Acme Supply Ltd', equal: true },
  { id: 'CR-6', name: 'NFD "Société" = NFC "Société"', a: 'Société', b: 'Société', equal: true },
  { id: 'CR-6', name: 'zero-width inside a name ignored', a: 'Acme​ Supply', b: 'Acme Supply', equal: true },
  { id: 'CR-6', name: 'NBSP between words is a space', a: 'Acme Supply', b: 'Acme Supply', equal: true },
  { id: 'CR-6', name: '"Société" vs "Societe"', a: 'Société', b: 'Societe', equal: false },
  { id: 'CR-6', name: '"Ltd" vs "Limited"', a: 'Acme Supply Ltd', b: 'Acme Supply Limited', equal: false },
  { id: 'CR-6', name: '"Ltd." vs "Ltd"', a: 'Acme Supply Ltd.', b: 'Acme Supply Ltd', equal: false },
  { id: 'CR-6', name: '"Supply" vs "Supplies"', a: 'Acme Supply', b: 'Acme Supplies', equal: false },
  { id: 'CR-6', name: '"Straße" vs "STRASSE"', a: 'Straße', b: 'STRASSE', equal: false },
]

test.each(nameRows)('$id $name', ({ a, b, equal }) => {
  expect(normalizeName(a) === normalizeName(b)).toBe(equal)
})

const blankRows = [
  { id: 'CR-1', name: 'empty', v: '', blank: true },
  { id: 'CR-1', name: 'spaces only', v: '   ', blank: true },
  { id: 'CR-1', name: 'NBSP only', v: ' ', blank: true },
  { id: 'CR-1', name: 'zero-width space only', v: '​', blank: true },
  { id: 'CR-1', name: 'tabs, line breaks, narrow NBSP', v: '\t\n ', blank: true },
  { id: 'CR-1', name: 'one letter is not blank', v: ' a ', blank: false },
  { id: 'CR-1', name: 'one zero is not blank', v: '0', blank: false },
]

test.each(blankRows)('$id isBlank: $name', ({ v, blank }) => {
  expect(isBlank(v)).toBe(blank)
})

test('CR-5 stripInvisible removes format characters and nothing else', () => {
  expect(stripInvisible('a​b‎c⁠d­e﻿')).toBe('abcde')
  expect(stripInvisible('1234-567 O')).toBe('1234-567 O')
})
