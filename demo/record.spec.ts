import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Silent draft capture for the demo video (PLAN M5). Walks the real app on the fictional sample data, scene by
// scene from demo/shotlist.json, and saves JPEG frames + demo/raw/frames.ffconcat + demo/timeline.json.
// ffmpeg then encodes demo/out/draft-silent.mp4. Cards (number, docs, limits, end) are plain HTML in the
// app's own colours, with no logos. The holds pace the scenes for a viewer; they aren't waits for the app.
// Run: npx playwright test --config demo/record.config.ts

const RAW = resolve('demo/raw')
const REPO_URL = process.env.PAYEE_REPO_URL ?? 'github.com/ahmedsohail2003/payee-check'
const TEST_COUNTS = process.env.PAYEE_TEST_COUNTS ?? ''

type Scene = { id: string; seconds: number }
const SCENES: Scene[] = JSON.parse(readFileSync(resolve('demo/shotlist.json'), 'utf8')).scenes
const LABELS = ['Account-holder/payee name', 'Institution number', 'Transit/branch number', 'Full account number', 'Name of person spoken to']
const MISMATCH = ['Harbourline Lumber Ltd.', '952', '60415', '73414471', 'Sam Okafor']
const LEGIT = ['Cedarline Electrical Supply Inc.', '958', '40388', '3307126', 'Priya Natarajan']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const CARD_CSS = `
  body { margin: 0; height: 100vh; display: grid; place-items: center; background: #F7F4EE; color: #14233C;
         font-family: "Segoe UI", system-ui, sans-serif; }
  .card { width: 1280px; background: #fff; border: 1px solid #D9D3C7; border-radius: 4px; padding: 56px 72px; }
  h1 { font-size: 44px; margin: 0 0 24px; font-weight: 600; }
  p { font-size: 28px; line-height: 1.45; margin: 0 0 18px; }
  .big { font-size: 64px; font-weight: 700; margin: 0 0 12px; }
  .muted { color: #4A5872; font-size: 22px; }
  pre { font-family: "Cascadia Mono", Consolas, monospace; font-size: 20px; line-height: 1.5; white-space: pre-wrap;
        margin: 0; max-height: 760px; overflow: hidden; }
  ul { font-size: 28px; line-height: 1.5; margin: 0; padding-left: 32px; }`

function card(body: string) {
  return `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div class="card">${body}</div></body></html>`
}

// A section of a planning doc, from its heading to the next heading of the same level.
function section(file: string, heading: string) {
  const text = readFileSync(resolve('devpost', file), 'utf8')
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const level = heading.match(/^#+/)?.[0] ?? '##'
  const rest = text.slice(start + heading.length)
  const next = rest.search(new RegExp(`\\n${level} `))
  return heading + (next < 0 ? rest : rest.slice(0, next))
}

async function fill(page: Page, values: string[]) {
  for (const [i, label] of LABELS.entries()) {
    await page.getByLabel(label, { exact: true }).pressSequentially(values[i] ?? '', { delay: 45 })
  }
}

test('silent draft capture: both journeys, the lock, the docs and the limits', async ({ page }) => {
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })
  const frames: { file: string; t: number }[] = []
  const timeline: { id: string; start: number; end: number }[] = []
  let sceneStart = 0
  let current = ''
  const t0 = performance.now()

  const begin = (id: string) => {
    current = id
    sceneStart = performance.now()
  }
  // Holds until the scene has lasted its target seconds, then records it in the timeline.
  const end = async () => {
    const target = (SCENES.find((s) => s.id === current)?.seconds ?? 5) * 1000
    const left = target - (performance.now() - sceneStart)
    if (left > 0) await page.waitForTimeout(left)
    timeline.push({ id: current, start: (sceneStart - t0) / 1000, end: (performance.now() - t0) / 1000 })
  }
  const hold = (ms: number) => page.waitForTimeout(ms)

  await page.clock.setFixedTime(new Date('2026-10-25T19:42:00Z'))
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Payee Check' })).toBeVisible()

  await page.screencast.start({
    size: { width: 1920, height: 1080 },
    quality: 90,
    onFrame: ({ data }) => {
      const file = `f${String(frames.length + 1).padStart(6, '0')}.jpg`
      writeFileSync(resolve(RAW, file), data)
      frames.push({ file, t: performance.now() })
    },
  })

  begin('s01')
  await end()

  begin('s02')
  await page.setContent(card(`
    <p class="big">$67.9 M</p>
    <p>reported lost to spear phishing in Canada in 2025, across 813 reports: the #2 fraud type by dollar loss.</p>
    <p>"Payment redirection frauds commonly target small and medium enterprises … businesses in the construction and contracting industry … are common targets."</p>
    <p class="muted">Canadian Anti-Fraud Centre, "Top frauds of 2025" and news release of 2026-05-13 (retrieved 2026-10-25).</p>`))
  await hold(6000)
  await page.goto('/')
  await expect(page.getByText('On hold—verification needed').first()).toBeVisible()
  await end()

  begin('s03')
  await page.getByRole('link', { name: 'Review request: Harbourline Lumber Ltd.' }).click()
  await expect(page.getByText('untrusted—not used').first()).toBeVisible()
  await hold(5000)
  await page.mouse.wheel(0, 500)
  await end()

  begin('s04')
  await page.getByRole('button', { name: 'Start call-back' }).click()
  await hold(4000)
  await fill(page, MISMATCH)
  await hold(1000)
  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByText('Full account number does not match: supplier said …4471, email requested …9020.')).toBeVisible()
  await end()

  begin('s05')
  await page.getByRole('button', { name: 'Save attempt' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Verification record PC-20261025-154200-001' })).toBeVisible()
  await hold(3500)
  await page.emulateMedia({ media: 'print' })
  await hold(3000)
  await page.emulateMedia({ media: 'screen' })
  await page.getByRole('link', { name: 'Back to overview' }).click()
  await page.getByRole('link', { name: 'Review request: Cedarline Electrical Supply Inc.' }).click()
  await page.getByRole('button', { name: 'Start call-back' }).click()
  await fill(page, LEGIT)
  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByText('Details match.')).toBeVisible()
  await hold(2000)
  await page.getByRole('button', { name: 'Save attempt' }).click()
  await page.getByRole('link', { name: 'Back to overview' }).click()
  await expect(page.getByText('Ready to pay').first()).toBeVisible()
  await end()

  begin('s06')
  await page.getByRole('link', { name: 'Review request: Harbourline Lumber Ltd.' }).click()
  await page.getByRole('button', { name: 'Try verification again' }).click()
  await page.getByRole('button', { name: "Couldn't verify" }).click()
  await page.getByLabel('Reason (optional)').pressSequentially('No answer', { delay: 45 })
  await page.getByRole('group', { name: "Couldn't verify" }).getByRole('button', { name: 'Save attempt' }).click()
  await expect(page.getByText('Not checked').first()).toBeVisible()
  await hold(3000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await hold(3000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await end()

  begin('s07')
  const docs = [
    ['devpost/scope.md', section('scope.md', '## The Unique Kernel')],
    ['devpost/prd.md', section('prd.md', '## Look and Feel')],
    ['devpost/checklist.md', readFileSync(resolve('devpost/checklist.md'), 'utf8').split('\n').filter((l) => /^- \[[x ]\] \*\*\d/.test(l)).join('\n')],
  ]
  for (const [name, text] of docs) {
    await page.setContent(card(`<p class="muted">${esc(name ?? '')}</p><pre>${esc(text ?? '')}</pre>`))
    await hold(7000)
  }
  await end()

  begin('s08')
  await page.setContent(card(`
    <h1>Honest limits</h1>
    <ul>
      <li>No AI model runs in this app; it was built with AI assistance, disclosed in the README.</li>
      <li>Nothing leaves the laptop: no server, no keys, no network calls.</li>
      <li>Fictional sample data only: no real call is placed and no money moves.</li>
      <li>It can't prove a call happened; it locks what was entered before comparing.</li>
      ${TEST_COUNTS ? `<li>${esc(TEST_COUNTS)}</li>` : ''}
    </ul>`))
  await end()

  begin('s09')
  await page.setContent(card(`
    <p class="big">Payee Check</p>
    <p>${esc(REPO_URL)}</p>
    <p class="muted">Built with the Devpost Learn Skill Pack</p>`))
  await end()

  const stoppedAt = performance.now()
  await page.screencast.stop()

  const lines = ['ffconcat version 1.0']
  frames.forEach((frame, i) => {
    const until = frames[i + 1]?.t ?? stoppedAt
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.034, (until - frame.t) / 1000).toFixed(3)}`)
  })
  const last = frames.at(-1)
  if (last) lines.push(`file '${last.file}'`)
  writeFileSync(resolve(RAW, 'frames.ffconcat'), lines.join('\n') + '\n')
  writeFileSync(resolve('demo/timeline.json'), JSON.stringify(timeline, null, 2) + '\n')
  expect(frames.length).toBeGreaterThan(50)
})
