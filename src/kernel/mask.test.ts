import { expect, test } from 'vitest'
import { lastFour, maskAccount } from './mask'

const maskRows = [
  { id: 'OV-6 VR-4', name: '"12349020" → "…9020"', v: '12349020', masked: '…9020' },
  { id: 'OV-6 VR-4', name: '"12 3490 20" → "…9020"', v: '12 3490 20', masked: '…9020' },
  { id: 'OV-6 VR-4', name: 'invisible characters dropped first', v: '1234​90 20', masked: '…9020' },
  { id: 'OV-6 VR-4', name: 'demo stated account', v: '73414471', masked: '…4471' },
  { id: 'OV-6 VR-4', name: 'seven-digit account', v: '3307126', masked: '…7126' },
]

test.each(maskRows)('$id $name', ({ v, masked }) => {
  expect(maskAccount(v)).toBe(masked)
})

test('OV-6 VR-4 the mask is one ellipsis character (U+2026) and four digits', () => {
  const masked = maskAccount('12349020')
  expect(masked.codePointAt(0)).toBe(0x2026)
  expect(masked).toHaveLength(5)
  expect(masked).not.toContain('1234')
})

test('OV-6 VR-4 lastFour reads the normalised value', () => {
  expect(lastFour('12 3490 20')).toBe('9020')
  expect(lastFour('73419020')).toBe('9020')
})
