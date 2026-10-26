import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// LF-3: the register look stays calm and readable. This file reads src/styles.css and the
// source files as text (node:fs), so it needs no browser. spec.md > Design tokens and > Avoid.

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url))
const STYLES = 'src/styles.css'

// ---------------------------------------------------------------------------------------------
// A small CSS reader: comments out, then a tree of blocks, so ":root" means the top-level rule
// and not one inside @media print.

type Block = { prelude: string; declarations: string; children: Block[]; parent: Block | null }
type Declaration = { property: string; value: string; important: boolean }
type StyleRule = { selectors: string[]; atRules: string[]; declarations: Declaration[] }

function readStyles(): string {
  try {
    return readFileSync(join(SRC_DIR, 'styles.css'), 'utf8')
  } catch (error) {
    throw new Error(`Could not read ${STYLES}: ${String(error)}`)
  }
}

function parseCss(css: string): Block {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const root: Block = { prelude: '', declarations: '', children: [], parent: null }
  let current = root
  let buffer = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '"' || ch === "'") {
      let end = i + 1
      while (end < text.length && text.charAt(end) !== ch) end += text.charAt(end) === '\\' ? 2 : 1
      if (end >= text.length) throw new Error(`${STYLES} has an unclosed ${ch} string. Is the file mid-edit?`)
      buffer += text.slice(i, end + 1)
      i = end
    } else if (ch === '{') {
      const cut = buffer.lastIndexOf(';')
      current.declarations += buffer.slice(0, cut + 1)
      const child: Block = { prelude: buffer.slice(cut + 1).trim(), declarations: '', children: [], parent: current }
      current.children.push(child)
      current = child
      buffer = ''
    } else if (ch === '}') {
      if (current.parent === null) throw new Error(`${STYLES} has a "}" with no matching "{". Is the file mid-edit?`)
      current.declarations += buffer
      current = current.parent
      buffer = ''
    } else {
      buffer += ch
    }
  }
  if (current !== root) {
    throw new Error(`${STYLES} never closes the block "${current.prelude}". Is the file mid-edit?`)
  }
  root.declarations += buffer
  return root
}

function declarationsOf(text: string): Declaration[] {
  return text
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .flatMap((d) => {
      const colon = d.indexOf(':')
      if (colon <= 0) return []
      const name = d.slice(0, colon).trim()
      const property = name.startsWith('--') ? name : name.toLowerCase()
      const raw = d.slice(colon + 1).trim()
      const important = /!\s*important\s*$/i.test(raw)
      const value = raw.replace(/\s*!\s*important\s*$/i, '').trim()
      return [{ property, value, important }]
    })
}

function styleRulesIn(block: Block, atRules: string[]): StyleRule[] {
  return block.children.flatMap((child) =>
    child.prelude.startsWith('@')
      ? styleRulesIn(child, [...atRules, child.prelude])
      : [
          {
            selectors: child.prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
            atRules,
            declarations: declarationsOf(child.declarations),
          },
          ...styleRulesIn(child, atRules),
        ],
  )
}

function allBlocks(block: Block): Block[] {
  return [block, ...block.children.flatMap(allBlocks)]
}

function atRulesOf(block: Block): string[] {
  const out: string[] = []
  for (let b = block.parent; b !== null; b = b.parent) if (b.prelude.startsWith('@')) out.unshift(b.prelude)
  return out
}

let cached: { css: string; sheet: Block } | null = null
function sheet(): Block {
  const css = readStyles()
  if (cached === null || cached.css !== css) cached = { css, sheet: parseCss(css) }
  return cached.sheet
}

// Both default to src/styles.css; the motion checks below also run them on small fixture sheets.
function styleRules(root: Block = sheet()): StyleRule[] {
  return styleRulesIn(root, [])
}

const isPrintOrForced = (atRules: string[]) => atRules.some((a) => /\bprint\b|forced-colors/i.test(a))

function rootTokens(root: Block = sheet()): Map<string, string> {
  const roots = styleRules(root).filter((r) => r.atRules.length === 0 && r.selectors.includes(':root'))
  if (roots.length === 0) {
    throw new Error(`${STYLES} has no top-level ":root { ... }" block, so there are no design tokens to check. Is the file mid-edit?`)
  }
  const tokens = new Map<string, string>()
  for (const rule of roots) for (const d of rule.declarations) if (d.property.startsWith('--')) tokens.set(d.property, d.value)
  return tokens
}

function resolveVars(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 5) throw new Error(`var() chain too deep while resolving "${value}" in ${STYLES}`)
  const resolved = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (whole, name: string) => {
    const v = tokens.get(name)
    if (v === undefined) throw new Error(`${STYLES} uses ${whole} but ${name} is not defined on :root`)
    return v
  })
  return resolved === value ? value : resolveVars(resolved, tokens, depth + 1)
}

// ---------------------------------------------------------------------------------------------
// WCAG 2 relative luminance and contrast ratio.

function rgbOf(hex: string): [number, number, number] {
  const six = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((c) => c + c).join('')
    : hex
  if (!/^#[0-9a-f]{6}$/i.test(six)) throw new Error(`"${hex}" is not a #RGB or #RRGGBB colour`)
  const n = parseInt(six.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string): number {
  const linear = (c8: number) => {
    const c = c8 / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgbOf(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function tokenColour(token: string): string {
  const tokens = rootTokens()
  const raw = tokens.get(token)
  if (raw === undefined) {
    const defined = [...tokens.keys()].join(', ') || 'none'
    throw new Error(`${token} is not defined on :root in ${STYLES} (defined: ${defined}). Is the file mid-edit?`)
  }
  const value = resolveVars(raw, tokens)
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    throw new Error(`${token} is "${raw}" in ${STYLES}; this test reads #RGB or #RRGGBB colours only`)
  }
  return value
}

// ---------------------------------------------------------------------------------------------
// 1. Tokens: exact values from spec.md > Design tokens, then the contrast of each pair in use.

const SPEC_TOKENS = [
  { id: 'LF-3', token: '--bg', value: '#F7F4EE' },
  { id: 'LF-3', token: '--surface', value: '#FFFFFF' },
  { id: 'LF-3', token: '--text', value: '#14233C' },
  { id: 'LF-3', token: '--muted', value: '#4A5872' },
  { id: 'LF-3', token: '--border', value: '#D9D3C7' },
  { id: 'LF-3', token: '--field-border', value: '#8A8170' },
  { id: 'LF-3', token: '--ok', value: '#1F6B3A' },
  { id: 'LF-3', token: '--ok-bg', value: '#E6F2EA' },
  { id: 'LF-3', token: '--hold', value: '#8A5A00' },
  { id: 'LF-3', token: '--hold-bg', value: '#FBF1DC' },
  { id: 'LF-3', token: '--bad', value: '#A3242A' },
  { id: 'LF-3', token: '--bad-bg', value: '#FBE6E6' },
]

test.each(SPEC_TOKENS)('$id token $token is $value on :root, as spec.md > Design tokens says', ({ token, value }) => {
  const tokens = rootTokens()
  const actual = tokens.get(token)
  expect(actual, `${token} is missing from the :root block in ${STYLES}`).toBeDefined()
  expect(actual?.toUpperCase(), `${token} in ${STYLES}`).toBe(value)
})

test('LF-3 the contrast formula gives 21:1 for black on white, 1:1 for a colour on itself, 4.54:1 for #767676 on white', () => {
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 10)
  expect(contrast('#FFFFFF', '#000')).toBeCloseTo(21, 10)
  expect(contrast('#14233C', '#14233C')).toBe(1)
  expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
})

const TEXT = 4.5 // WCAG 1.4.3, normal-size text
const NON_TEXT = 3 // WCAG 1.4.11, a control's boundary and the focus ring

// `documented` is the hand-worked ratio printed in spec.md > Design tokens (one decimal place).
const PAIRS: Array<{ id: string; fg: string; bg: string; min: number; use: string; documented?: number }> = [
  { id: 'LF-3', fg: '--text', bg: '--surface', min: TEXT, use: 'text on working surfaces', documented: 15.7 },
  { id: 'LF-3', fg: '--text', bg: '--bg', min: TEXT, use: 'text on the page', documented: 14.3 },
  { id: 'LF-3', fg: '--muted', bg: '--surface', min: TEXT, use: 'hints and column headings', documented: 7.2 },
  { id: 'LF-3', fg: '--muted', bg: '--bg', min: TEXT, use: 'hints on the page', documented: 6.5 },
  { id: 'LF-3', fg: '--ok', bg: '--ok-bg', min: TEXT, use: 'green = verified badge', documented: 5.7 },
  { id: 'LF-3', fg: '--hold', bg: '--hold-bg', min: TEXT, use: 'amber = held badge, untrusted tag', documented: 5.3 },
  { id: 'LF-3', fg: '--bad', bg: '--bad-bg', min: TEXT, use: 'red = mismatch badge, row, error banner', documented: 6.2 },
  { id: 'LF-3', fg: '--surface', bg: '--text', min: TEXT, use: 'label on the filled navy button' },
  { id: 'LF-3', fg: '--ok', bg: '--surface', min: TEXT, use: '"Matches" in a table' },
  { id: 'LF-3', fg: '--ok', bg: '--bg', min: TEXT, use: 'green words on the page' },
  { id: 'LF-3', fg: '--hold', bg: '--surface', min: TEXT, use: 'amber words on a surface' },
  { id: 'LF-3', fg: '--hold', bg: '--bg', min: TEXT, use: 'the hold line on the page' },
  { id: 'LF-3', fg: '--bad', bg: '--surface', min: TEXT, use: '"Does not match" and "Missing"' },
  { id: 'LF-3', fg: '--bad', bg: '--bg', min: TEXT, use: 'red words on the page' },
  { id: 'LF-3', fg: '--text', bg: '--hold-bg', min: TEXT, use: 'contact text inside the untrusted marker' },
  { id: 'LF-3', fg: '--field-border', bg: '--surface', min: NON_TEXT, use: 'input and outlined-button edges', documented: 3.8 },
  { id: 'LF-3', fg: '--field-border', bg: '--bg', min: NON_TEXT, use: 'outlined-button edges on the page', documented: 3.5 },
  { id: 'LF-3', fg: '--text', bg: '--surface', min: NON_TEXT, use: 'focus ring (--text) on a surface', documented: 15.7 },
  { id: 'LF-3', fg: '--text', bg: '--bg', min: NON_TEXT, use: 'focus ring (--text) on the page', documented: 14.3 },
]

test.each(PAIRS)('$id contrast $fg on $bg is at least $min:1 ($use)', ({ fg, bg, min, documented }) => {
  const ratio = contrast(tokenColour(fg), tokenColour(bg))
  expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below ${min}:1`).toBeGreaterThanOrEqual(min)
  if (documented !== undefined) {
    expect(
      Math.abs(ratio - documented),
      `${fg} on ${bg} is ${ratio.toFixed(2)}:1 but spec.md > Design tokens says ${documented}:1`,
    ).toBeLessThan(0.1)
  }
})

test('LF-3 the focus ring is a :focus-visible outline drawn in --text', () => {
  const outlines = styleRules()
    .filter((r) => !isPrintOrForced(r.atRules) && r.selectors.some((s) => s.includes(':focus-visible')))
    .flatMap((r) =>
      r.declarations
        .filter((d) => d.property === 'outline' || d.property === 'outline-color')
        .map((d) => `${r.selectors.join(', ')} { ${d.property}: ${d.value} }`),
    )
  expect(outlines.length, `no :focus-visible rule in ${STYLES} sets an outline`).toBeGreaterThan(0)
  const notText = outlines.filter((o) => !/var\(\s*--text\s*[,)]/.test(o) && !/:\s*(none|0)\s*}$/.test(o))
  expect(notText, `every :focus-visible outline in ${STYLES} uses var(--text)`).toEqual([])
})

test('LF-3 bank numbers: .mono uses the Cascadia Mono stack with tabular-nums and never wraps', () => {
  const tokens = rootTokens()
  const rules = styleRules().filter((r) => r.atRules.length === 0 && r.selectors.includes('.mono'))
  expect(rules.length, `${STYLES} has no top-level .mono rule`).toBeGreaterThan(0)
  const decl = new Map(rules.flatMap((r) => r.declarations.map((d) => [d.property, d.value] as const)))
  const stack = (v: string) => resolveVars(v, tokens).replace(/'/g, '"').replace(/\s*,\s*/g, ', ').trim()
  expect(stack(decl.get('font-family') ?? '(none)')).toBe('"Cascadia Mono", Consolas, "Courier New", monospace')
  expect(decl.get('font-variant-numeric') ?? '(none)').toMatch(/\btabular-nums\b/)
  expect(decl.get('white-space') ?? '(none)').toBe('nowrap')
})

// ---------------------------------------------------------------------------------------------
// 2. The Avoid list: gradients, @keyframes, @import, @font-face and emoji, in every source file.

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { encoding: 'utf8', recursive: true })
    .filter((f) => /\.(css|ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => 'src/' + f.split(sep).join('/'))
    .sort()
}

const AVOID: Array<{ name: string; pattern: RegExp }> = [
  { name: 'gradient', pattern: /gradient/i },
  { name: '@keyframes', pattern: /@(-[a-z]+-)?keyframes/i },
  { name: '@import', pattern: /@import/i },
  { name: '@font-face', pattern: /@font-face/i },
]

test('LF-3 the Avoid-list scan reads every source file under src/ and skips tests', () => {
  const files = sourceFiles()
  expect(files).toContain('src/styles.css')
  expect(files).toContain('src/copy.ts')
  expect(files).toContain('src/App.tsx')
  expect(files).toContain('src/screens/RecordView.tsx')
  expect(files).toContain('src/kernel/compare.ts')
  expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([])
  expect(files.length).toBeGreaterThanOrEqual(20)
})

test('LF-3 Avoid list: no gradient, @keyframes, @import, @font-face or emoji in src/**/*.{css,ts,tsx}', () => {
  const hits: string[] = []
  for (const file of sourceFiles()) {
    const lines = readFileSync(join(SRC_DIR, '..', file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      const where = `${file}:${index + 1}`
      for (const { name, pattern } of AVOID) if (pattern.test(line)) hits.push(`${where} has ${name}`)
      for (const ch of line) {
        if (/\p{Emoji_Presentation}/u.test(ch) || ch === '\u{FE0F}') {
          const code = (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
          hits.push(`${where} has emoji U+${code}`)
        }
      }
    })
  }
  expect(hits).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// 3. Motion: at most a 150 ms transition, and none at all under prefers-reduced-motion: reduce.
//
// The stylesheet writes its one duration once, as the token --transition, and every transition reads
// "color var(--transition)". So each check resolves var() against the :root tokens before it reads a time,
// and a custom property that holds a time obeys the same 150 ms limit as a transition.

const MAX_TRANSITION_MS = 150
const MOTION_PROPERTIES = new Set(['transition', 'transition-duration'])

const timesIn = (value: string) =>
  [...value.matchAll(/(\d*\.?\d+)(ms|s)\b/gi)].map((m) => Number(m[1]) * ((m[2] ?? '').toLowerCase() === 's' ? 1000 : 1))

function resolvedTimes(value: string, tokens: Map<string, string>): number[] {
  return timesIn(resolveVars(value, tokens))
}

function selectorsOf(block: Block): string[] {
  return block.prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' '))
}

const declarationAt = (block: Block, d: Declaration) =>
  `${block.prelude.replace(/\s+/g, ' ') || '(top level)'} { ${d.property}: ${d.value} }`

// Every animation, and every transition or time-holding custom property longer than 150 ms.
function motionProblems(root: Block): string[] {
  const tokens = rootTokens(root)
  const problems: string[] = []
  for (const block of allBlocks(root)) {
    for (const d of declarationsOf(block.declarations)) {
      if ((d.property === 'animation' || d.property === 'animation-name') && !/^none\b/i.test(d.value)) {
        problems.push(`${declarationAt(block, d)} animates`)
      }
      const timed = MOTION_PROPERTIES.has(d.property) || (d.property.startsWith('--') && timesIn(d.value).length > 0)
      if (timed && resolvedTimes(d.value, tokens).some((ms) => ms > MAX_TRANSITION_MS)) {
        problems.push(`${declarationAt(block, d)} is longer than ${MAX_TRANSITION_MS} ms`)
      }
    }
  }
  return problems
}

const isReduce = (a: string) => /prefers-reduced-motion\s*:\s*reduce/i.test(a)
const isNoPreference = (a: string) => /prefers-reduced-motion\s*:\s*no-preference/i.test(a)

// The transitions that would still run for someone who asked for reduced motion. A transition moves when its
// resolved times include anything over 1 ms. Under prefers-reduced-motion: reduce it is switched off only by a
// `transition: none` (or 0s) that is !important, because a `*` rule without it loses to every class selector
// that sets a transition, and only on selectors that cover it (`*`, or the same selector).
function transitionsLeftOn(root: Block): string[] {
  const tokens = rootTokens(root)
  const moving: Array<{ selectors: string[]; text: string }> = []
  const stilled = new Set<string>()
  for (const block of allBlocks(root)) {
    const context = atRulesOf(block)
    for (const d of declarationsOf(block.declarations)) {
      if (!MOTION_PROPERTIES.has(d.property)) continue
      const moves = resolvedTimes(d.value, tokens).some((ms) => ms > 1)
      if (context.some(isReduce)) {
        if (!moves && d.important) for (const s of selectorsOf(block)) stilled.add(s)
      } else if (!context.some(isNoPreference) && moves) {
        moving.push({ selectors: selectorsOf(block), text: declarationAt(block, d) })
      }
    }
  }
  const covered = (selector: string) => stilled.has('*') || stilled.has(selector)
  return moving.filter((m) => !m.selectors.every(covered)).map((m) => m.text)
}

test('LF-3 Avoid list: no CSS animation, and no transition longer than 150 ms, in src/styles.css', () => {
  expect(motionProblems(sheet())).toEqual([])
})

test('LF-3 src/styles.css has a non-empty @media (prefers-reduced-motion) block', () => {
  const blocks = allBlocks(sheet()).filter((b) =>
    /^@media\b.*\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)/i.test(b.prelude),
  )
  expect(blocks.length, `${STYLES} has no @media (prefers-reduced-motion: ...) block`).toBeGreaterThan(0)
  expect(blocks.some((b) => b.children.length > 0), 'the prefers-reduced-motion block has no rules').toBe(true)
})

test('LF-3 under prefers-reduced-motion: reduce, any transition the sheet declares is switched off', () => {
  // Guard: the sheet really has transitions to switch off, so an empty answer below means something.
  const declared = allBlocks(sheet()).flatMap((b) =>
    atRulesOf(b).some(isReduce) ? [] : declarationsOf(b.declarations).filter((d) => MOTION_PROPERTIES.has(d.property)),
  )
  expect(declared.length, `${STYLES} declares no transition at all`).toBeGreaterThan(0)
  expect(
    transitionsLeftOn(sheet()),
    `${STYLES} declares these transitions but never sets transition: none !important (or 0s) for them under prefers-reduced-motion: reduce`,
  ).toEqual([])
})

// The two checks above must be able to fail. Each is run on a small sheet built like src/styles.css, then on
// the same sheet with one thing broken.
const FIXTURE_TOKENS = ':root { --transition: 150ms ease; --space-1: 4px; }'
const FIXTURE_RULES = '.btn { transition: color var(--transition), border-color var(--transition); }'
const FIXTURE_REDUCE = '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }'

test('LF-3 the motion checks resolve var(): they pass the 150 ms sheet and fail a 600 ms --transition or a 0.6s literal', () => {
  expect(motionProblems(parseCss(FIXTURE_TOKENS + FIXTURE_RULES + FIXTURE_REDUCE))).toEqual([])
  expect(motionProblems(parseCss(FIXTURE_TOKENS.replace('150ms', '600ms') + FIXTURE_RULES + FIXTURE_REDUCE))).toEqual([
    ':root { --transition: 600ms ease } is longer than 150 ms',
    '.btn { transition: color var(--transition), border-color var(--transition) } is longer than 150 ms',
  ])
  expect(motionProblems(parseCss(FIXTURE_TOKENS + 'a { transition: color 0.6s; }'))).toEqual([
    'a { transition: color 0.6s } is longer than 150 ms',
  ])
  expect(motionProblems(parseCss(FIXTURE_TOKENS + 'a { animation: spin 100ms; }'))).toEqual([
    'a { animation: spin 100ms } animates',
  ])
})

test('LF-3 the reduced-motion check fails when the reduce block is missing, lacks !important, or covers other selectors', () => {
  const left = ['.btn { transition: color var(--transition), border-color var(--transition) }']
  expect(transitionsLeftOn(parseCss(FIXTURE_TOKENS + FIXTURE_RULES + FIXTURE_REDUCE))).toEqual([])
  expect(transitionsLeftOn(parseCss(FIXTURE_TOKENS + FIXTURE_RULES))).toEqual(left)
  expect(transitionsLeftOn(parseCss(FIXTURE_TOKENS + FIXTURE_RULES + FIXTURE_REDUCE.replace(' !important', '')))).toEqual(left)
  expect(transitionsLeftOn(parseCss(FIXTURE_TOKENS + FIXTURE_RULES + FIXTURE_REDUCE.replace('*, *::before, *::after', '.link')))).toEqual(left)
  expect(
    transitionsLeftOn(
      parseCss(FIXTURE_TOKENS + FIXTURE_RULES + '@media (prefers-reduced-motion: reduce) { .btn { transition-duration: 0s !important; } }'),
    ),
  ).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// 4. The record has a print stylesheet.

test('LF-3 src/styles.css has a non-empty @media print block for the record', () => {
  const blocks = allBlocks(sheet()).filter((b) => /^@media\s+print\b/i.test(b.prelude))
  expect(blocks.length, `${STYLES} has no @media print block`).toBeGreaterThan(0)
  expect(blocks.some((b) => b.children.length > 0), 'the @media print block has no rules').toBe(true)
})
