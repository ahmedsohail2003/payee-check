import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// spec.md > How the map stays true: the Verification Map is read from devpost/spec.md and checked
// against every real test title, so it can't claim coverage that no longer exists. Every failure
// prints the exact IDs, titles or files. E2E rule: every E2E cell other than "—" needs a Playwright
// title starting with its ID, the checkScreen/fixture cells (CB-5, LF-1) included. File rule: every
// test file a cell names (`record`: …) exists and holds a title starting with that row's ID.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const SPEC = read('devpost/spec.md')
const NONE = '—'
const leadingIds = (s: string) => /^((?:[A-Z]{2}-\d+\s+)*[A-Z]{2}-\d+)(?=\s|$)/.exec(s)?.[1]?.split(/\s+/) ?? []

// A cell names its test files at the start of a ";"-separated part: `name`: …, `a`, `b`: …, `name` (…) or a
// bare `name`. Backticked words elsewhere (`lockAndCompare`, `null`, `img`) are values, not files.
const FILE_REF = /^\s*(`[a-z][a-z-]*`(?:\s*,\s*`[a-z][a-z-]*`)*)\s*(?::|\(|$)/
const filesNamed = (cell: string) =>
  cell.split(';').flatMap((part) => [...(FILE_REF.exec(part)?.[1] ?? '').matchAll(/`([a-z][a-z-]*)`/g)].map((m) => m[1] ?? ''))

const rows = SPEC.split('\n').filter((l) => /^\| [A-Z]{2}-\d+ \|/.test(l)).map((line) => {
  const [id = '', , unit = '', e2e = '', hands = ''] = line.split('|').slice(1, -1).map((c) => c.trim())
  return {
    id,
    unit: unit !== NONE,
    e2e: e2e !== NONE,
    unitNames: filesNamed(unit),
    e2eNames: filesNamed(e2e),
    hands: hands.match(/H-\d+/g) ?? [],
    cells: line.split('|').length - 2,
  }
})
const mapIds = new Set(rows.map((r) => r.id))
const script = SPEC.slice(SPEC.indexOf('### Hands-on review script'), SPEC.indexOf('\n## ', SPEC.indexOf('### Hands-on review script')))
const steps = [...script.matchAll(/^- \*\*(H-\d+)[^*]*\*\* \(([^)]*)\)/gm)].map((m) => ({ step: m[1] ?? '', ids: (m[2] ?? '').split(/,\s*/) }))

const list = (dir: string, re: RegExp) =>
  readdirSync(join(ROOT, dir), { encoding: 'utf8', recursive: true }).filter((f) => re.test(f)).map((f) => `${dir}/${f.split(sep).join('/')}`).sort()
const unitFiles = list('src', /\.test\.ts$/) // vite.config.ts: Vitest runs src/**/*.test.ts
const e2eFiles = list('tests/e2e', /\.(?:spec|test)\.[cm]?[jt]sx?$/) // Playwright's default testMatch

const CALL = /^[ \t]*(?:test|it)(?:\.each\(\s*([\w$.]+)\s*\))?\s*\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/gm
const problems: string[] = []
function titlesOf(file: string): { title: string; ids: string[] }[] {
  const text = read(file)
  const found = [...text.matchAll(CALL)].map((m) => {
    const [table, title = ''] = [m[1], m[3]]
    const field = /^\$(\w+)/.exec(title)?.[1]
    if (!table || !field) return { title, ids: leadingIds(title) }
    const decl = new RegExp(String.raw`^([ \t]*)(?:export\s+)?(?:const|let)\s+${table.replace(/[$.]/g, '\\$&')}\b`, 'm').exec(text)
    const indent = decl?.[1] ?? ''
    const body = decl ? text.slice(decl.index).split(new RegExp(String.raw`\n${indent}\]`))[0] ?? '' : ''
    // Each row is checked on its own: a row is a "{" one level in from the table, and its first field must be
    // the title's field as a literal that starts with a map ID. Nested fields (an attempt's `id: 'A-005'`) sit
    // deeper and are never read as rows.
    const rowCount = body.match(new RegExp(String.raw`\n${indent}  \{`, 'g'))?.length ?? 0
    const values = [...body.matchAll(new RegExp(String.raw`\n${indent}  \{\s*${field}:\s*(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`, 'g'))].map(
      (v) => v[2] ?? '',
    )
    if (rowCount === 0 || values.length !== rowCount) {
      problems.push(`${file}: test.each(${table}) has ${rowCount} rows but ${values.length} start with a literal ${field}`)
    }
    for (const value of values) {
      if (leadingIds(value).length === 0) problems.push(`${file}: test.each(${table}) row ${field} "${value}" starts with no map ID`)
    }
    return { title, ids: [...new Set(values.flatMap(leadingIds))] }
  })
  const calls = text.match(/^[ \t]*(?:test|it)(?:\.each)?\s*\(/gm)?.length ?? 0
  if (calls !== found.length) problems.push(`${file}: ${calls} test calls but ${found.length} titles read`)
  return found
}
const unit = unitFiles.flatMap((file) => titlesOf(file).map((t) => ({ file, ...t })))
const e2e = e2eFiles.flatMap((file) => titlesOf(file).map((t) => ({ file, ...t })))
const covered = (suite: typeof unit) => new Set(suite.flatMap((t) => t.ids))

test('the map parses: every row has five cells, IDs are unique, the count matches the spec, titles were read', () => {
  expect(rows.filter((r) => r.cells !== 5).map((r) => r.id)).toEqual([])
  expect(rows.length).toBe(Number(/(\d+) IDs:/.exec(SPEC)?.[1]))
  expect(mapIds.size).toBe(rows.length)
  expect(steps.map((s) => s.step)).toEqual(['H-1', 'H-2', 'H-3', 'H-4', 'H-5', 'H-6'])
  expect(unitFiles.length * e2eFiles.length * unit.length * e2e.length).toBeGreaterThan(0)
  expect(problems).toEqual([])
  // The file names are read too: a bare `name` before ";", two names before ":", and only at the start of a part.
  expect(rows.find((r) => r.id === 'VR-4')?.unitNames).toEqual(['mask', 'record'])
  expect(rows.find((r) => r.id === 'SB-1')?.unitNames).toEqual(['store', 'invariants'])
  expect(rows.find((r) => r.id === 'RQ-2')?.e2eNames).toEqual(['mismatch-journey'])
  expect(rows.filter((r) => r.unit && r.unitNames.length === 0).map((r) => r.id)).toEqual([])
})

test('the map: every test file a cell names exists and has a title starting with that row\'s ID', () => {
  const idsIn = (file: string) => new Set([...unit, ...e2e].filter((t) => t.file === file).flatMap((t) => t.ids))
  const check = (id: string, wanted: string, file: string | undefined) =>
    !file ? [`${id}: ${wanted} does not exist`] : idsIn(file).has(id) ? [] : [`${id}: no title in ${file} starts with ${id}`]
  const wrong = rows.flatMap((r) => [
    ...r.unitNames.flatMap((n) => check(r.id, `src/**/${n}.test.ts`, unitFiles.find((f) => f.endsWith(`/${n}.test.ts`)))),
    ...r.e2eNames.flatMap((n) => check(r.id, `tests/e2e/${n}.spec.ts`, e2eFiles.find((f) => f === `tests/e2e/${n}.spec.ts`))),
  ])
  expect(wrong).toEqual([])
})

test('the map: every ID with a Unit entry has a Vitest title starting with it', () => {
  const titled = covered(unit)
  expect(rows.filter((r) => r.unit && !titled.has(r.id)).map((r) => r.id)).toEqual([])
})

test('the map: every ID with an E2E entry has a Playwright title starting with it', () => {
  const titled = covered(e2e)
  expect(rows.filter((r) => r.e2e && !titled.has(r.id)).map((r) => r.id)).toEqual([])
})

test('the map: no test title starts with an ID that is not in the table', () => {
  const unknown = [...unit, ...e2e].flatMap((t) => t.ids.filter((id) => !mapIds.has(id)).map((id) => `${t.file}: ${id} in "${t.title}"`))
  expect(unknown).toEqual([])
})

test('the map: every test title outside this file starts with at least one ID (so a typo like "CR3" cannot hide)', () => {
  const self = 'src/traceability.test.ts'
  expect([...unit, ...e2e].filter((t) => t.file !== self && t.ids.length === 0).map((t) => `${t.file}: "${t.title}"`)).toEqual([])
})

test('the map: a hands-on-only ID is named by an H-step, and every H-n a row names lists that ID', () => {
  const named = (id: string) => steps.some((s) => s.ids.includes(id))
  const handsOnly = rows.filter((r) => !r.unit && !r.e2e)
  expect(handsOnly.map((r) => r.id)).toEqual(['LF-4'])
  expect(handsOnly.filter((r) => r.hands.length === 0 || !named(r.id)).map((r) => r.id)).toEqual([])
  const wrong = rows.flatMap((r) => r.hands.filter((h) => !steps.find((s) => s.step === h)?.ids.includes(r.id)).map((h) => `${r.id} ${h}`))
  expect(wrong).toEqual([])
})

test('the map: no test file skips, isolates or inverts a test', () => {
  // Playwright's test.fail and Vitest's test.fails turn a failing test into a pass, which would beat the break pass.
  const banned = ['only', 'skip', 'fixme', 'todo', 'fail', 'fails'].map((w) => '.' + w + '(')
  const files = [...unitFiles, ...list('tests/e2e', /\.[cm]?[jt]sx?$/)]
  expect(files.flatMap((f) => banned.filter((b) => read(f).includes(b)).map((b) => `${f}: ${b}`))).toEqual([])
})
