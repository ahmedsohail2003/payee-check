import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// Static guards (spec.md > Where It Runs: Runtime, > Untrusted contacts in the email, > Verification Map).
// SB-4: no code in src/ or index.html *can* call out (the E2E fixture shows nothing *did*).
// RQ-2: email content is text, never HTML. CB-5: nothing starts a call or an email.
// RS-2: Reset removes only payee-check:v1, never the whole origin's storage.

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function scannedFiles(): string[] {
  const src = readdirSync(join(ROOT, 'src'), { encoding: 'utf8', recursive: true })
    .filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.ts$/.test(f))
    .map((f) => 'src/' + f.split(sep).join('/'))
  return [...src.sort(), 'index.html']
}

// The whole authority (everything before the path) must be a plain host under .example, with an optional port.
// Anything else in it is flagged: user info (`a.example@evil.com` goes to evil.com) and a backslash (`new URL`
// reads `https://evil.com\y.example` as host evil.com) both point the browser somewhere other than they look.
const isExampleHost = (m: RegExpMatchArray) => /^[a-z\d-]+(?:\.[a-z\d-]+)*\.example(?::\d+)?$/i.test(m[1] ?? '')

type Rule = { id: string; name: string; pattern: RegExp; allow?: (m: RegExpMatchArray) => boolean; sample: string }

const RULES: Rule[] = [
  { id: 'SB-4', name: 'fetch', pattern: /\bfetch\b/g, sample: 'const r = await fetch("/api/x")' },
  { id: 'SB-4', name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/g, sample: 'new XMLHttpRequest()' },
  { id: 'SB-4', name: 'WebSocket', pattern: /\bWebSocket\b/g, sample: 'new WebSocket(url)' },
  { id: 'SB-4', name: 'EventSource', pattern: /\bEventSource\b/g, sample: 'new EventSource("/feed")' },
  { id: 'SB-4', name: 'sendBeacon', pattern: /\bsendBeacon\b/g, sample: 'navigator.sendBeacon("/log", data)' },
  { id: 'SB-4', name: 'import() of a URL', pattern: /\bimport\s*\(\s*['"`](?:[a-z][a-z\d+.-]*:|\/\/)/gi, sample: 'await import("https://cdn.example/x.js")' },
  { id: 'SB-4', name: 'URL outside .example', pattern: /\b(?:https?|wss?):\/\/([^\s'"`<>()/?#]*)/gi, allow: isExampleHost, sample: '<link href="https://fonts.googleapis.com/css">' },
  { id: 'SB-4', name: 'protocol-relative URL', pattern: /['"`(=]\s*\/\/(?=[^\s/])/g, sample: '<script src="//cdn.evil.com/x.js"></script>' },
  { id: 'RQ-2', name: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/g, sample: '<div dangerouslySetInnerHTML={{ __html: body }} />' },
  { id: 'RQ-2', name: 'innerHTML', pattern: /\binnerHTML\b/g, sample: 'el.innerHTML = body' },
  { id: 'RQ-2', name: 'outerHTML', pattern: /\bouterHTML\b/g, sample: 'el.outerHTML = body' },
  { id: 'RQ-2', name: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\b/g, sample: 'el.insertAdjacentHTML("beforeend", body)' },
  { id: 'RQ-2', name: 'document.write', pattern: /\bdocument\s*\.\s*write(?:ln)?\b/g, sample: 'document.write(body)' },
  { id: 'RQ-2', name: 'eval(', pattern: /\beval\s*\(/g, sample: 'eval(code)' },
  { id: 'RQ-2', name: 'new Function', pattern: /\b(?:new\s+)?Function\s*\(/g, sample: 'new Function("return 1")' },
  { id: 'CB-5', name: 'tel: link', pattern: /\btel:/gi, sample: '<a href="tel:+14165550188">Call</a>' },
  { id: 'CB-5', name: 'mailto: link', pattern: /\bmailto:/gi, sample: '<a href="mailto:ap@harbourline-pay.example">Email</a>' },
  { id: 'RS-2', name: 'localStorage.clear', pattern: /\blocalStorage\s*(?:\.\s*clear\b|\[\s*['"`]clear['"`]\s*\])/g, sample: 'window.localStorage.clear()' },
]

function hits(rule: Rule, text: string): string[] {
  return [...text.matchAll(rule.pattern)].filter((m) => !rule.allow?.(m)).map((m) => m[0])
}

test('SB-4 the static guards read every source file under src/ (tests excluded) and index.html', () => {
  const files = scannedFiles()
  for (const f of ['index.html', 'src/App.tsx', 'src/styles.css', 'src/copy.ts', 'src/data/samples.ts', 'src/components/EmailView.tsx', 'src/screens/CallbackStep.tsx', 'src/app/useAppState.ts']) {
    expect(files).toContain(f)
  }
  expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([])
  expect(files.length).toBeGreaterThanOrEqual(25)
})

test.each(RULES)('$id the $name matcher fires on a sample that contains it', (rule) => {
  expect(hits(rule, rule.sample).length, rule.sample).toBeGreaterThan(0)
})

test('SB-4 the URL matcher allows only hosts ending in .example', () => {
  const url = RULES.find((r) => r.name === 'URL outside .example')
  if (!url) throw new Error('URL rule missing')
  expect(hits(url, '"https://harbourline-pay.example/confirm" and "http://a.example:8080/x"')).toEqual([])
  expect(hits(url, 'http://localhost:5180/ https://evil.example.com/ wss://x.test https://a.example@evil.com/').length).toBe(4)
  // A backslash in the host, as source text holds it (`\\` in a string) and as a JSX attribute holds it (`\`).
  expect(hits(url, '"https://evil.com\\\\y.example/a" href="https://evil.com\\y.example/a"').length).toBe(2)
})

test('SB-4 every way of writing an outside address is caught by some SB-4 rule, and plain .example ones are not', () => {
  const sb4 = RULES.filter((r) => r.id === 'SB-4')
  const caught = (text: string) => sb4.flatMap((rule) => hits(rule, text))
  for (const text of [
    '<link href="https://fonts.googleapis.com/css">',
    'https://a.example@evil.com/',
    "'https://evil.com\\\\y.example/a'",
    '<a href="https://evil.com\\y.example/a">',
    '<script src="//cdn.evil.com/x.js"></script>',
    '@import url(//fonts.googleapis.com/css);',
    "const cdn = '//cdn.evil.com/x.js'",
    'img.src = `//cdn.evil.com/pixel.gif`',
  ]) {
    expect(caught(text), text).not.toEqual([])
  }
  for (const text of [
    "'https://harbourline-pay.example/confirm'",
    'http://a.example:8080/x',
    '// a comment on its own line',
    'const total = a + b // a trailing comment',
    "href={'#/request/req-legit'}",
  ]) {
    expect(caught(text), text).toEqual([])
  }
})

test.each(RULES)('$id no $name in src/**/*.{ts,tsx,css} or index.html', (rule) => {
  const found: string[] = []
  for (const file of scannedFiles()) {
    readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
      for (const hit of hits(rule, line)) found.push(`${file}:${i + 1} ${hit}`)
    })
  }
  expect(found).toEqual([])
})
