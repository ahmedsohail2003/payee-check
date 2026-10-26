import { expect, test } from 'vitest'
import { compareDetails, comparisonLine } from './compare'
import type { BankDetails } from './types'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

// The mismatch sample's requested details, written out so a sample edit can't silently change the test.
const requested: BankDetails = deepFreeze({
  payeeName: 'Harbourline Lumber Ltd.',
  institution: '952',
  transit: '60415',
  account: '73419020',
})
const stated = (change: Partial<BankDetails>): BankDetails => deepFreeze({ ...requested, ...change })

test('CR-3 CR-8 same last four, earlier digit differs → mismatch', () => {
  const { results, outcome } = compareDetails(requested, stated({ account: '73429020' }))
  expect(results).toEqual({ payeeName: 'match', institution: 'match', transit: 'match', account: 'mismatch' })
  expect(outcome).toBe('mismatch')
})

const differsAlone = [
  { id: 'CR-3', name: 'payee name differs alone', key: 'payeeName', value: 'Harbourline Lumber Limited' },
  { id: 'CR-3', name: 'institution differs alone', key: 'institution', value: '953' },
  { id: 'CR-3', name: 'transit differs alone', key: 'transit', value: '06415' },
  { id: 'CR-3', name: 'account differs alone', key: 'account', value: '73414471' },
  { id: 'CR-3', name: 'first account digit differs', key: 'account', value: '83419020' },
  { id: 'CR-3', name: 'account one digit longer', key: 'account', value: '734190200' },
] as const

test.each(differsAlone)('$id $name', ({ key, value }) => {
  const { results, outcome } = compareDetails(requested, stated({ [key]: value }))
  for (const field of ['payeeName', 'institution', 'transit', 'account'] as const) {
    expect(results[field]).toBe(field === key ? 'mismatch' : 'match')
  }
  expect(outcome).toBe('mismatch')
})

test('CR-3 all four equal after normalising → verified', () => {
  const typed = stated({ payeeName: '  harbourline   LUMBER ltd. ', institution: '9 5 2', transit: '60415​', account: '7341 9020' })
  expect(compareDetails(requested, typed)).toEqual({
    results: { payeeName: 'match', institution: 'match', transit: 'match', account: 'match' },
    outcome: 'verified',
  })
})

test('CR-3 compareDetails returns new objects and leaves both inputs untouched', () => {
  const typed = stated({ account: '73414471' })
  const before = structuredClone(typed)
  compareDetails(requested, typed)
  expect(typed).toEqual(before)
})

const lineRows = [
  {
    id: 'CR-8',
    name: 'demo line masks unequal last fours',
    typed: { account: '73414471' },
    line: 'Full account number does not match: supplier said …4471, email requested …9020.',
  },
  {
    id: 'CR-8',
    name: 'same last four shows both in full',
    typed: { account: '73429020' },
    line: 'Full account number does not match: supplier said 73429020, email requested 73419020.',
  },
  {
    id: 'CR-8',
    name: 'same last four, values as stored',
    typed: { account: '7342 9020' },
    line: 'Full account number does not match: supplier said 7342 9020, email requested 73419020.',
  },
  {
    id: 'CR-3',
    name: 'transit shown in full',
    typed: { transit: '06415' },
    line: 'Transit/branch number does not match: supplier said 06415, email requested 60415.',
  },
  {
    id: 'CR-3',
    name: 'name ending in a period, one stop',
    typed: { payeeName: 'Harbourline Lumber Limited' },
    line: 'Account-holder/payee name does not match: supplier said Harbourline Lumber Limited, email requested Harbourline Lumber Ltd.',
  },
  {
    id: 'CR-3',
    name: 'two mismatches, labels in form order',
    typed: { account: '73414471', institution: '953' },
    line: '2 details do not match: Institution number, Full account number.',
  },
  {
    id: 'CR-3',
    name: 'four mismatches',
    typed: { payeeName: 'Other Ltd.', institution: '001', transit: '00001', account: '1' },
    line: '4 details do not match: Account-holder/payee name, Institution number, Transit/branch number, Full account number.',
  },
  {
    id: 'CR-3',
    name: 'all match',
    typed: { payeeName: 'HARBOURLINE LUMBER LTD.' },
    line: 'Details match.',
  },
]

test.each(lineRows)('$id comparisonLine: $name', ({ typed, line }) => {
  const said = stated(typed)
  const { results } = compareDetails(requested, said)
  expect(comparisonLine(requested, said, deepFreeze(results))).toBe(line)
})
