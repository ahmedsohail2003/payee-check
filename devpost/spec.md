---
doc: spec
status: approved
---

# Payee Check — Technical Spec

> **How to read this.** Every section opens with one plain sentence: what that part does and why. Read only those sentences and you have the whole app in about two minutes. Everything underneath is the reasoning and the exact rules: what each choice prevents, and how it's proven.

## At a Glance

```
            Chrome on this laptop  ──  http://localhost:5180 (Vite)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Screens (React)        Overview → Request detail → Call-back → Comparison → Record
 │        │  draw from                                                      │
 │        ▼                                                                 │
 │  App state hook   "save first, show second"                              │
 │        │  asks                 │  writes / reads                         │
 │        ▼                       ▼                                         │
 │  Kernel (plain functions)    Store ── localStorage "payee-check:v1"      │
 │  rules · statuses · records    (one key, whole state, read back)         │
 │        ▲                                                                 │
 │  Sample data (read-only code file: 5 suppliers, 5 payments, 2 requests)  │
 └──────────────────────────────────────────────────────────────────────────┘
   Proven by: Vitest (rules) · Playwright in Chrome (journeys) · tsc (types) · your hands-on review
```

- **One rule book.** Every rule lives in the kernel, as plain functions with tests, so a screen can't quietly bend a rule.
- **One source of truth.** Statuses are worked out from saved attempts and never stored separately, so they can't disagree with the records.
- **Save first, show second.** Nothing reads "Saved", "Verified" or "Ready to pay" until the write has been read back.
- **Nothing leaves the laptop.** No server of ours, no keys, no network calls. Every test fails if the page reaches for anything outside the laptop.
- **Every requirement has a named proof.** Each PRD criterion has an ID, and a test checks that the ID is proven.

## How This Works, In Plain Language
Payee Check is a website that runs entirely on your laptop, in Chrome. Nothing leaves your laptop: the page talks only to the small local server Vite runs, and the tests fail if it ever reaches for anything else.

- **The screens** are written in **React**, a library that draws each screen from the current data. When a request moves from "held" to "compared and locked" to "saved", every screen showing it updates from the same data instead of being patched by hand. **TypeScript** is JavaScript with types, so the build catches mistakes like treating an account number as a number and losing its leading zeros. **Vite** serves the app at `http://localhost:5180` while it's being built and checked.
- **The rules** sit in their own folder, the **kernel**, with no screens and no saving in it. The kernel decides:
  - whether two sets of bank details match;
  - when an attempt locks;
  - what each payment's status is;
  - what goes on a record.

  It's plain functions, so tests call them directly and check every rule without opening a browser.
- **The sample data** (fictional suppliers, this week's payments, the two change-request emails with their requested details already structured) is a file in the code. It never changes.
- **What you do in the app** (each attempt, its locked answers, a revealed-but-unsaved comparison, saved records) is written to **localStorage**, a sticky note the browser keeps for one site. It goes under its own key, `payee-check:v1`, on its own port.
  - It's plain text in this browser, readable in Chrome's developer tools, which is fine only because every value is fictional.
  - On every load, the app reads the sticky note back, checks it obeys the rules, and rebuilds every status from the sample data plus your attempts.
  - **Reset demo** throws away only that sticky note.
- **Saving comes first, showing comes second.** Compare locks the answers and writes them *before* the comparison appears. Save attempt writes the record *before* "Saved", "Verified" or "Ready to pay" appears. If a write fails, you see a clear error and a way to recover, never a status that wasn't actually saved.
- **Three kinds of checks** prove it works: **unit tests (Vitest)** on the rules, **end-to-end tests (Playwright)** that drive your installed Chrome through every journey like a person would, and a **TypeScript type check**. A short **hands-on review** covers what a machine can't judge, such as whether the look is calm or the printout reads like a business form.

Why this shape and not something bigger: there's one user, fictional data and no accounts. A server or database would add moving parts without proving anything about the call-back.

## The Core Journey Through the System
In one line: your journey from `prd.md > The Core Journey`, traced through the pieces above.

1. **Open the app.** `main.tsx` starts React, and the **App state hook** asks the **Store** to load `payee-check:v1`.
   - Missing (first use) → the state is "no attempts".
   - Valid → it's used.
   - Invalid (bad shape, or contradicts the rules) → the **Recovery notice** replaces the app.
   - Unreadable (the browser blocks storage) → the app runs with "no attempts" and a persistent "can't save" notice.

   See `Important Failure Modes`.
2. **Overview.** It combines the **Sample data** with the kernel's derived statuses. Two rows read "On hold—verification needed". Rows without a request read "Scheduled" and aren't clickable. Accounts show only their last four digits.
3. **Open a flagged row** ("Review request") → `#/request/<requestId>` → **Request detail**. It shows:
   - the email, through the **Email view**, where the From address and every phone, email address and link in the subject or body is marked untrusted, as plain text, never a link;
   - existing vs requested details, in full;
   - the hold status;
   - previous attempts.
4. **Start the call-back** → `#/request/<requestId>/call` → **Call-back step**. It shows the supplier, the trusted on-file number (as text), the script and five blank fields. The screen is built from a type that has no email or requested values in it. Typing lives only in the screen's temporary memory, so Back or a reload before Compare discards it.
5. **Press Compare.**
   - The kernel checks every required answer is present. If any are missing, it refuses and names the missing fields.
   - Otherwise it builds a **locked attempt** (the answers, a result for each field and the overall outcome, status `compared`), and the Store writes it.
   - **Only if the write succeeds** does the app reveal the **Comparison** at `#/request/<requestId>/compare`. If it fails, the answers stay editable and unlocked, nothing is revealed, and an error explains it.
6. **Comparison.** It reads the locked attempt from saved state, not from the form, so Back and a reload show the same locked result. The only action is **Save attempt**. "Details match." still leaves the payment held until you save.
7. **Press Save attempt.** The kernel turns the attempt into a **Verification record** and marks the attempt saved, and the Store writes both in one write.
   - Only after that does the app go to `#/record/<recordId>` showing "Saved".
   - The status becomes Verified / Ready to pay, or "On hold—details do not match".
   - On failure, the app stays on the unsaved Comparison with an error and **Try again**.
8. **Couldn't verify** (on the Call-back step) → an optional short reason, and the person spoken to if a call happened → a saved attempt with every field "Not checked", plus its record → the record view. The payment shows "On hold—verification incomplete" with the reason. On failure, the app stays on the Call-back step with your typing intact.
9. **Retry.** Allowed only when the latest attempt is saved and isn't verified. It returns to step 4 with blank fields. Earlier records never change.
10. **Reload anywhere.** The Store reloads and the Router reads the address. A route that no longer fits the state, or names something that doesn't exist, is replaced with the right one (`Router`).

## Stack
In one line: the smallest set of tools that fits your choices, each one pinned to an exact version that runs on this laptop.

On 2026-10-25, `npm view <pkg>@<version> engines` confirmed each pin runs on the installed **Node 22.14.0**: Vite and its React plugin need `^20.19.0 || >=22.12.0`, and Vitest needs `^22.12.0`. Chrome 156.0.8078.48 is installed (read from `chrome.exe` version info).

| Piece | Pin | Why (learner choice unless marked) | Docs |
|---|---|---|---|
| TypeScript | `typescript@6.0.3` | Your choice: types keep bank identifiers as strings and catch mistakes early | https://www.typescriptlang.org/docs/ |
| React | `react@19.3.0`, `react-dom@19.3.0`, `@types/react@19.3.0`, `@types/react-dom@19.3.0` | Your choice: screens drawn from one source of data | https://react.dev/learn |
| Vite | `vite@8.3.4`, `@vitejs/plugin-react@6.1.2` | Your choice: a local dev server with instant reload, no deployment | https://vite.dev/guide/ |
| Vitest | `vitest@5.0.3` | Your choice: unit tests for the kernel, Store, routes and static scans, run in Node (no fake browser) | https://vitest.dev/guide/ |
| Playwright | `@playwright/test@1.64.0` with `channel: 'chrome'` | Your choice: end-to-end tests in the installed Chrome, no browser download | https://playwright.dev/docs/intro · https://playwright.dev/docs/browsers#google-chrome--microsoft-edge |
| zod | `zod@4.6.7` (not 4.6.5: see `Decisions and Open Issues > Install-time corrections`) | **Agent recommendation, accepted by you on 2026-10-26.** One schema describes the saved data's exact shape and gives a typed result or a clear failure, for your "invalid saved data" rule. `z.strictObject` also rejects unknown keys. Alternative: a hand-written checker, with no dependency but more code to get right | https://zod.dev/ |
| Node types | `@types/node@22.20.5` | Implementation detail: types for config and test files (the static-scan tests read files with `node:fs`) | — |

Nothing else: no router library, CSS framework, icon library, component-testing library or mutation-testing tool. The tradeoff you accepted is that React is one more framework for the agent to get right, in exchange for screens that can't drift from the data.

Unverified until install: whether `npm install` warns about optional peer dependencies of Vite 8 and the React plugin (for example `esbuild`, `babel-plugin-react-compiler`). These are listed as peers, and none is needed here. Check the install output early in the build.

## Where It Runs and How Someone Tries It
In one line: one command starts it at `http://localhost:5180`, one command proves it, and the demo is recorded from the same local app.

- **Port 5180, not Vite's default 5173.** `vite.config.ts` sets `server: { port: 5180, strictPort: true }`. The host stays `localhost` (never `--host`), and Vite's `cors`, `allowedHosts` and `fs` defaults are left alone, so other devices on the Wi-Fi and other sites open in Chrome can't read the dev server.
  - *Why:* localStorage belongs to an origin (scheme + host + port), and your other entry also plans `localhost:5173` with localStorage. On one port, the two apps would share storage.
  - With `reuseExistingServer`, Playwright would also silently test the other app whenever its server was running.
- **Runtime:** Chrome on this laptop, served by Vite at `http://localhost:5180`.
  - The page talks only to that server: its files and its reload websocket.
  - There's no server of our own, no API keys and no `.env`. Fonts are system fonts and icons are inline SVG, so nothing is fetched.
  - Chrome's own background traffic (updates, Safe Browsing) isn't the app's and isn't measured.
  - Proven two ways (`Verification Map`, SB-4): `src/guards.test.ts` shows no code *can* call out, and the network watch in every E2E spec shows nothing *did*.
- **Requirements:** Node 22.14.0 or newer (≥ 22.12 required) and Google Chrome.
- **Start it (PowerShell, one command per line):**
  ```
  npm install
  npm run dev
  ```
  Then open `http://localhost:5180`.
- **Checks** (exact `package.json` scripts):

  | Command | Script | What it does |
  |---|---|---|
  | `npm run typecheck` | `tsc --noEmit` | type check |
  | `npm test` | `vitest run` | unit tests, run once (plain `vitest` would sit in watch mode in an interactive terminal) |
  | `npm run e2e` | `playwright test` | end-to-end tests |
  | `npm run check` | `npm run typecheck && npm test && npm run e2e` | all three in order |

  - npm runs scripts through `cmd.exe` on Windows (`npm config get script-shell` is unset), so `&&` inside `package.json` scripts is fine. Typed PowerShell lines never use `&&`.
  - The port lives in `vite.config.ts`, never on the command line, because PowerShell can swallow a `--` passed to `npm.ps1`.
- **Playwright config:**
  - `testDir: 'tests/e2e'`, `workers: 1`, `retries: 0`, `forbidOnly: true`;
  - `use: { channel: 'chrome', baseURL: 'http://localhost:5180', timezoneId: 'America/Toronto', trace: 'retain-on-failure' }`;
  - `webServer: { command: 'npm run dev', url: 'http://localhost:5180', reuseExistingServer: true }`.

  The reasons:
  - **Retries are 0** because a retried flake is a hidden failure.
  - **`forbidOnly`** stops a leftover `.only` from silently skipping the rest.
  - **The zone is pinned, and record tests fix the clock,** because records print a zone. Ontario's clocks change on Nov 1, so an "EDT" assertion against the real clock would start failing for anyone who runs the public repo's checks after that.
  - **One worker,** because this laptop runs one heavy job at a time (16 GB RAM, two entries). Never run it alongside another Playwright or ffmpeg job.
- **Recording the demo:** run `npm run dev`, open `http://localhost:5180` in Chrome, and walk both journeys. The fictional supplier's lines are in the README's "Try it" section, not in the app:
  - **mismatch sample:** the supplier states an account ending **4471** (the email asked for **…9020**);
  - **legitimate sample:** the supplier states exactly what the email requested.
- **Submission:** the demo video and a public GitHub repository. **No deployment**, per `scope.md > Explicitly Cut`.

## Look and Feel
In one line: a calm payment register and verification form, where every colour has a job and every status is also spelled out in words with an icon. From `prd.md > Look and Feel`.

Plain CSS in `src/styles.css`, with design tokens as CSS custom properties on `:root`.

### Design tokens
Each token serves `prd.md > Look and Feel`. The ratios were worked out by hand with the WCAG formula. `src/look.test.ts` recomputes them and fails below 4.5:1 for text, or below 3:1 for `--field-border` and the focus ring.

| Token | Value | Why | Contrast |
|---|---|---|---|
| `--bg` | `#F7F4EE` | the warm off-white of a paper register; less glare than white over a long session | — |
| `--surface` | `#FFFFFF` | where numbers are read and typed gets the most contrast | — |
| `--text` | `#14233C` | dark navy, also the primary-button fill, so filled navy always means "the next action" | 15.7:1 on surface, 14.3:1 on bg |
| `--muted` | `#4A5872` | hints and secondary labels; still AA, so muted never means hard to read | 7.2:1 / 6.5:1 |
| `--border` | `#D9D3C7` | table dividers only (decorative) | 1.5:1, so never a control's only edge |
| `--field-border` | `#8A8170` | edges of inputs and outlined buttons. WCAG 1.4.11 needs 3:1 for a control's boundary, and `--border` misses it | 3.8:1 / 3.5:1 |
| focus ring | `--text`, 2 px outline, 2 px offset | the offset keeps it visible around the navy primary button | 15.7:1 |
| `--ok` on `--ok-bg` | `#1F6B3A` on `#E6F2EA` | green = verified | 5.7:1 |
| `--hold` on `--hold-bg` | `#8A5A00` on `#FBF1DC` | amber dark enough to be text, not a warning yellow | 5.3:1 |
| `--bad` on `--bad-bg` | `#A3242A` on `#FBE6E6` | red = mismatch | 6.2:1 |

- **Spacing:** one 4 px scale (a 44 px row = 12 + 20 + 12).
- **Corners:** 4 px. Small corners read as form fields; large ones read as the tiles the Avoid list rules out.
- **Type size:** body 16 px, hints never below 14 px. Hierarchy comes from weight and order, not size.
- **Fonts:**
  - text: `"Segoe UI", system-ui, -apple-system, Roboto, sans-serif`;
  - bank numbers: `"Cascadia Mono", Consolas, "Courier New", monospace` with `font-variant-numeric: tabular-nums`, so digits line up and leading zeros are visible.

### Status = colour + icon + words, always
`Icon.tsx` holds a small inline-SVG set:

| Icon | Used for |
|---|---|
| check | verified, "Matches" |
| clock | held, incomplete |
| cross | mismatch, "Does not match", "Missing" |
| dash | "Not checked". It's neutral, so an uncollected field never borrows the check |
| shield-slash | untrusted |
| shield-check | the trusted on-file number. The two shields share a shape, which teaches trusted vs untrusted at a glance |

Badges and the untrusted marker carry `border: 1px solid transparent`. Windows contrast themes remove background colours and turn that border into a visible outline.

### Density
- Compact tables (rows about 44 px) with clear headings, content no wider than about 1100 px, and one obvious next action per screen (`Screen contract`).
- Each table sits in an `overflow-x: auto` wrapper, so a long value scrolls the table, never the page.
- Bank numbers never wrap (`white-space: nowrap`), because a wrapped account number reads as two numbers.
- Email text uses `white-space: pre-wrap; overflow-wrap: anywhere`, so a long untrusted link can't widen the page.

### Avoid
Gradients, emoji, oversized tiles, charts, and animation beyond a 150 ms focus or hover transition. `prefers-reduced-motion` is respected. `src/look.test.ts` (Vitest, `node:fs`) scans `src/**/*.{css,ts,tsx}`, excluding tests, for `gradient`, `@keyframes`, `@import`, `@font-face` and emoji (`/\p{Emoji_Presentation}/u`). It also requires `prefers-reduced-motion` and `@media print` in `styles.css`.

### Copy rules
- Every user-visible string lives in `src/copy.ts`. Tests write PRD strings out literally and never import `copy.ts`, so a typo there fails a test instead of being copied into it.
- **One character per mark:**
  - em dash `—` (U+2014), unspaced in sentences and statuses ("On hold—verification needed"; the untrusted tag is "untrusted—not used");
  - ellipsis `…` (U+2026) in masks;
  - straight apostrophe ("Couldn't verify").

  Exact-text checks and accessible-name lookups then can't fail on a look-alike character. The page-title separator is a spaced " — ".
- Plain words in sentence case, like a form. Status strings are verbatim from the PRD.
- **Strings the PRD requires but doesn't word** (change any wording you like):

  | Where | Text |
  |---|---|
  | Overview, who-it's-for line | the PRD's opening sentence: "Payee Check helps owners and bookkeepers at small trades and construction firms in Waterloo Region verify a supplier's "our bank details changed" email." |
  | Overview, labels | "Fictional sample data—no real call or payment" and "No AI model runs in this app—sample requests are preloaded and the rules run in code." The second wording avoids being read as "no AI was used to build this", which the README discloses. |
  | Call-back step, under the script | "Hiding the email doesn't prove the call was independent." |
  | Every record (screen and print), under the outcome | "This record shows what was entered and when. It doesn't prove a call took place." |
  | Record result, account row, when both values end in the same four digits | "Does not match (differs before the last four digits)". Records are masked, so without this a printout would show …9020 against …9020 marked "Does not match", which reads like a bug. |
  | Beside every "Ready to pay" (Overview row, verified Request detail, record) | "Simulated—no money moves." |
  | Call-back step, refused Compare | heading "Compare needs every answer", then one item per missing label; "Missing" beside each blank field |
  | Couldn't verify | label "Reason (optional)"; hint "For example: No answer, or Supplier couldn't confirm." |
  | Comparison, overall line | "Details match." / "<Label> does not match: supplier said <stated>, email requested <requested>." / "<n> details do not match: <label>, <label>." The account shows as `…NNNN`, unless both values end in the same four digits; then both show in full, so the line never reads "…9020" against "…9020". |
  | Comparison, under the outcome | "Payment still on hold—save this attempt to record the result." |
  | Record, blank person / reason | "Not recorded" / "No reason recorded" |
  | Reset dialog | heading "Reset demo?"; body "This clears your saved attempts, records and any unsaved comparison, and restores the starting sample data."; buttons "Cancel" and "Yes, reset" |
  | Save failure | "Couldn't save—nothing was changed." with **Try again** |
  | Storage unreadable | "This browser isn't letting Payee Check save. You can look around, but attempts can't be saved." |
  | Recovery notice | "Your saved demo data couldn't be read. Nothing has been shown from it." with **Reset demo** |

- **Lengths:** reason `maxLength={200}`, names `maxLength={100}`, number fields `maxLength={30}`. The longest possible record still prints on one page, and no value can widen a table.

### Print
`@media print`, the record view:
- `@page { size: auto; margin: 15mm }`, where `auto` follows the printer's A4 or Letter. Hidden: `<header>`, every button and link, and banners.
- **Content, in the PRD's order** (`prd.md > Verification records`):
  1. "Payee Check" and the record's `<h1>`, with the fictional-data label in a 1 px black box;
  2. record ID, saved date and time with zone, outcome, resulting payment status, and the honesty line;
  3. supplier, payment reference, amount, due date;
  4. email checked, trusted number used, person spoken to;
  5. the details table (Detail | Requested (email) | Stated (supplier) | Result), with the account masked in both columns;
  6. reason or note.

  Labelled pairs use a two-column `<dl>`, so the page reads as a business form.
- **No colour needed.** Browsers drop background colours when printing by default, so everything is `color: #000; background: none`.
  - Badges keep a 1 px black border.
  - Icons use `currentColor`.
  - Result words are bold, and a mismatch row adds a 2 px left rule.

  A printed mismatch can't pass for a verified record.
- **One page:** 10.5 pt body and `break-inside: avoid` on each block. The input length caps bound the longest possible record.
- **Proof:** `masking-and-print.spec.ts` saves `page.pdf({ format: 'A4' })` and `page.pdf({ format: 'Letter' })` for a mismatch record and a verified record to `test-results/`, and asserts each is one page. You open those PDFs for the black-and-white check (H-4), so no printer is needed.

### Accessibility basics
- **Structure:** `<html lang="en-CA">`, `<header>` and `<main>` landmarks, and one `<h1>` per screen (`Screen contract`). Real `<button>`, `<a href>` and `<table>` elements. Each table has a `<caption>` and `<th scope="col">`, and each row's first cell is `<th scope="row">`, so a screen reader names the supplier or field on every cell. A visible `:focus-visible` ring, and a label on every input.
- **Flagged rows:** the request cell holds one real link, "Review request" plus a visually hidden ": <supplier>". It's stretched over the row (`tr { position: relative }`, `a::after { content: ""; position: absolute; inset: 0 }`), so a click anywhere on the row opens it. Keyboard and screen-reader users meet one uniquely named link. Never put `onClick` on a `<tr>`: Tab can't reach it. Rows without a request show "None" and have no link.
- **One announcement per kind of change:**
  - a screen change → heading focus (`Router`). There's no `aria-live` on the comparison, because a live region rendered together with its content isn't announced;
  - a failed save or reset → `ErrorBanner`: a `role="alert"` container that's always mounted at the top of `<main>` and empty when there's no error. The message renders as `<p key={errorCount}>`, so a repeated identical failure is announced again;
  - the "can't save" notice is static text, not an alert.
- **Icons:** `aria-hidden="true" focusable="false"` and `fill="currentColor"`. The words carry the status.
- **Reset dialog:** call `showModal()`, then `cancelRef.current.focus()`. Otherwise `showModal()` focuses the first button, and a stray Enter resets the demo. Esc = Cancel (native).
- **Phone-number safety:** `index.html` has `<meta name="format-detection" content="telephone=no, email=no, address=no">`, so mobile browsers never turn a displayed number into tap-to-call. It also has `<link rel="icon" href="data:,">`, so Chrome's automatic `/favicon.ico` request can't log a 404.
- A `.visually-hidden` utility (the clip pattern) is defined once in `styles.css`.

## Components

### Kernel
In one line: the rule book. Plain TypeScript functions in `src/kernel/` that decide matches, locks, statuses and records, with no screens, no saving and no clock of their own.

- **No React, no localStorage, no reading the clock directly.** Functions that need more than their direct inputs take a context, `ctx = { samples, now, timeZone }`, so tests can pass their own fixtures and a fixed clock.
- **Every function returns new data and never changes its inputs.** Unit tests deep-freeze every input, so any accidental change throws.

**Why each rule exists.** Every kernel rule protects a line of `scope.md > The Unique Kernel` and closes one real way a payment gets redirected or mis-keyed. A rule that can't be tied to a row here doesn't belong in the kernel.

| Rule | Protects (scope) | Without it |
|---|---|---|
| Only the on-file number is offered; email contacts are untrusted text, never links | "The only number shown to call is the supplier's previously stored number" | You call the email's number, the fraudster answers and "confirms" the change. |
| The Call-back step never receives the requested values, and answers lock before any comparison exists | "state the new details independently, without first reading out the email's claim" | The caller reads the new number aloud, or "fixes" an answer after seeing the email. The check then confirms the email against itself. |
| Every digit is compared, with no last-four shortcut | "compares the answer with the requested change" | A lookalike account that keeps the same last four digits passes. |
| Bank identifiers stay strings, and leading zeros count | same | As numbers, `"004"` = `"4"`, so a different bank or branch matches. |
| Only spacing, invisible characters and name case are ignored; no fuzzy matching | same | A near-miss payee ("Supply" vs "Supplies") is waved through as close enough. |
| Compare needs all four details and the person spoken to | "records that answer" | An unfinished call is saved as a mismatch instead of couldn't verify, and a "Verified" record names no one. |
| Status comes only from saved attempts | "The payment stays on hold if they differ or verification is incomplete" | An unsaved or abandoned check releases the payment. |
| Couldn't verify writes "Not checked", never "Match" | same | An uncollected field reads as confirmed on the printout. |
| Attempts and records are append-only | "A dated, printable record ties the whole process together" | A later success overwrites the earlier mismatch, hiding that someone tried to redirect the payment. |

#### Normalising and comparing
In one line: two values match only if they're the same apart from spacing, invisible characters and (for names) letter case. `normalize.ts`, `compare.ts`. Implements `prd.md > Comparison rules`.

- **Strings end to end.** Bank identifiers are never parsed as numbers.
- **Invisible characters:** `stripInvisible(v) = v.replace(/\p{Cf}/gu, '')` removes zero-width spaces, word joiners, soft hyphens and direction marks. Copy-paste can carry them, and if they're left in, two identical-looking values "don't match".
- **Numbers** (institution, transit, account): `normalizeNumber(v) = stripInvisible(v).replace(/\s/g, '')`. JavaScript's `\s` already covers tabs, line breaks, the non-breaking space (U+00A0) and the narrow non-breaking space (U+202F), so `"1234 567"` = `"1234567"` however it was spaced. Never write a literal `' '` instead.
- **Deliberately not normalised:** hyphens, dots, letters (such as `O` for `0`) and full-width digits, and there's no Unicode NFKC.
  - Each of these is a difference a person can see, so it's compared literally and holds the payment. Mapping look-alikes would be the fuzzy matching the PRD rules out.
  - Every requested and on-file number in the samples is digits only (`samples.test.ts`), so a stray character can only cause a mismatch, never a false match.
- **Payee name:** `normalizeName(v) = stripInvisible(v).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()`, compared with `===`.
  - NFC makes "é" typed as one character equal "e" followed by an accent. That's the same text, not fuzziness.
  - Use `toLowerCase()`. Never use `toUpperCase()`: `"ß"` becomes `"SS"`, so "Straße" would equal "STRASSE". Never use `localeCompare` or `Intl.Collator` either: base sensitivity also ignores accents, so "Société" would equal "Societe".
- **Blank means blank after normalising:** `isBlank(v) = normalizeName(v) === ''` is the only definition. The `missing` refusal, `personSpokenTo → null` and "No reason recorded" all use it. A field holding only spaces or a zero-width space counts as missing, so it can never reach "Verified".
- **`compareDetails(requested, stated)`** returns `{ payeeName, institution, transit, account }`, each `'match' | 'mismatch'`, plus `outcome: 'verified' | 'mismatch'`, which is `verified` only if all four match. Masked values are never passed in.
- **`normalize.test.ts` rows:**
  - `"1234 567"`, `"1234 567"`, `"1 234 567"`, `"1234567​"` and `"1234\t567\n"` all equal `"1234567"`;
  - `"004"` ≠ `"4"`;
  - `"1234-567"`, `"O1234"` and `"１２３４"` don't equal their digit forms;
  - `"  acme   SUPPLY ltd "` = `"Acme Supply Ltd"`;
  - NFD "Société" = NFC "Société"; "Société" ≠ "Societe";
  - "Ltd" ≠ "Limited"; "Ltd." ≠ "Ltd";
  - `isBlank` is true for `"   "`, `" "` and `"​"`.

#### Attempts and status rules
In one line: every attempt moves through five phases in one table, and every screen, guard and refusal reads that one table. `attempts.ts`. Implements `prd.md > Outcomes and payment status` and `prd.md > Retrying and reopening`.

All three actions return one result type:

```ts
type KernelResult =
  | { ok: true; state: PersistedState; attemptId: string; recordId: string | null }
  | { ok: false; reason: 'missing'; missing: AnswerKey[] }
  | { ok: false; reason: 'verified' | 'pending_comparison' | 'not_compared' | 'unknown_request' | 'unknown_attempt' }
```

- `lockAndCompare(state, requestId, answers, ctx)` → appends an attempt with `status: 'compared'` and `recordId: null`.
- `saveAttempt(state, attemptId, ctx)` → turns that `compared` attempt into `saved`, appends its record and returns the `recordId`.
- `saveCouldntVerify(state, requestId, { reason, personSpokenTo }, ctx)` → appends a saved attempt with outcome `couldnt_verify`, every result `'not_checked'`, `stated: null` and its record. Both inputs are optional, and a blank `personSpokenTo` is stored as `null`.
- **Attempt IDs** are `A-` + the attempt's position, zero-padded to three digits (`A-001`). Attempts are only appended, and Reset clears them all, so IDs are unique (`Invariants`).

##### The attempt lifecycle, in one table
Every attempt rule reads one derived value, `phaseOf(state, requestId)`. It's taken from that request's attempts in **array order** (the order they were appended). Timestamps never sort anything or decide a status, because a laptop clock can be set back.

| Phase | When | Payment status |
|---|---|---|
| `needs_verification` | no attempts | "On hold—verification needed" |
| `pending` | last attempt is `compared` | unchanged: the latest saved attempt's status, or "On hold—verification needed" |
| `held_mismatch` | last attempt saved as `mismatch` | "On hold—details do not match" |
| `held_incomplete` | last attempt saved as `couldnt_verify` | "On hold—verification incomplete" + reason |
| `verified` | last attempt saved as `verified` (final) | "Ready to pay"; request "Verified" |

| Phase ↓ / Action → | `lockAndCompare` | `saveAttempt(attemptId)` | `saveCouldntVerify` | Start / Try again |
|---|---|---|---|---|
| `needs_verification` | → `pending`, or `missing` | nothing to save | → `held_incomplete` | opens `/call` |
| `pending` | `pending_comparison` | the pending attempt → `verified` or `held_mismatch` (its locked outcome) | `pending_comparison` | redirects to `/compare` |
| `held_mismatch`, `held_incomplete` | → `pending`, or `missing` | `not_compared` | → `held_incomplete` (a new attempt) | opens `/call` |
| `verified` | `verified` | `not_compared` | `verified` | redirects to `/request/:id` (read-only) |

- **`saveAttempt`:** an ID that doesn't exist → `unknown_attempt`. Any attempt other than the pending one → `not_compared`, so it saves exactly the comparison on screen.
- An unknown request → `unknown_request`. Reset demo returns every request to `needs_verification`.
- **Refusal order:** `unknown_*` → `verified` → `pending_comparison` → `missing` (fields listed in form order). The reason no typing can fix comes first, so a verified request never asks you to fill in fields.
- **One source of truth:** `canStartAttempt` is true in the phases whose Start column opens `/call`. `canStartAttempt`, `deriveRequestView`, every `resolveRoute` guard and every refusal read `phaseOf`, so the router can never open a Call-back step for a request the kernel would refuse at Compare.
- **`deriveRequestView(state, requestId, samples)`** returns:
  - the phase and its payment status (and "Verified" for the request);
  - the latest saved attempt's `reason`, shown next to "On hold—verification incomplete", or "No reason recorded" when it's blank;
  - the pending `compared` attempt, if any;
  - the list of saved attempts.
- **Payments without a request** always show the neutral status **"Scheduled"**.
- **Unit:** `attempts.test.ts` has one `test.each` row per table cell, and each row also asserts `checkInvariants` is empty on the result.

#### Records and masking
In one line: a record is a dated snapshot of exactly what was true at save time, and it shows only the account's last four digits. `record.ts`, `mask.ts`. Implements `prd.md > Verification records`.

- **Each form of a value has one job:**
  - *Stored:* exactly as typed, in `Attempt.stated`, `personSpokenTo`, `reason` and the record. The PRD records the person spoken to "as the user entered it".
  - *Compared:* `normalizeNumber` / `normalizeName` of both sides, computed inside `compareDetails` and never stored. So every result can be recomputed from what's stored (`Invariants`).
  - *Displayed:* the stored value.
- **A record is a snapshot.** `buildRecord` copies everything the record shows at save time: supplier name, payment reference, amount, due date, trusted number, requested and stated details, and the email reference. The record view prints only from the record.
  - `resultingPaymentStatus` is the status at save time. After a retry verifies, the earlier mismatch record still says "On hold—details do not match", because that was true when it was saved.
  - It also carries the label "Fictional sample data—no real call or payment".
  - `recordResultLabel(field, record)` gives each row's result words. For a masked account whose two values end in the same four digits, it returns "Does not match (differs before the last four digits)".
- **Record ID and saved time:** see `Time and money formats`.
- **Masking:** `maskAccount(v)` = `"…"` + the last four characters of `normalizeNumber(v)`, so `"12 3490 20"` gives `"…9020"`, never `"…0 20"`.
  - Shown in full: the Request detail, the Call-back inputs, the Comparison table, and localStorage.
  - Shown as `…NNNN`: the Overview and every record, on screen and printed.
  - Never shown: the URL, the page title, the console, any HTML attribute. `MaskedAccount` receives the full value but puts only `…NNNN` into the DOM.
  - Institution and transit are never masked.
  - Masking limits what a screen or a printout shows. It isn't encryption, and the README says so.

#### Time and money formats
In one line: one clock reading per action, every time printed in the record's own zone, and dates that never slip a day. `src/kernel/format.ts`.

Pure functions. The zone and locale are always passed in or pinned, never the machine's defaults, so the laptop's settings can't change a printed record.

- **One clock read per action.** The hook captures `now` once and passes it in `ctx`, and `savedAt = now.toISOString()` (UTC). The record ID and the printed time both come from that one instant. A save at 11:59:59.9 PM can't get one day in the ID and the next day on the page.
- **Record ID** `PC-YYYYMMDD-HHMMSS-NNN`. The date and time parts come from `formatToParts` in `ctx.timeZone` with `hourCycle: 'h23'`; with `hour12: false`, Chrome can print midnight as `24`. `NNN` is the record's position, so two saves in the same second still get different IDs.
- **Saved time:** `new Intl.DateTimeFormat('en-US', { timeZone: record.timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })` gives "Oct 25, 2026, 3:42 PM EDT".
  - It always uses the record's own zone, never the viewer's, so an Oct 25 record still prints "EDT" after the clocks change on Nov 1.
  - Don't use `dateStyle` or `timeStyle`: they throw when combined with `timeZoneName`.
- **Date-only values never become a `Date`.** `formatDateOnly('2026-10-30')` gives "Oct 30, 2026" and is built from the string's parts. `new Date('2026-10-30')` is UTC midnight, which displays as Oct 29 in Waterloo Region, so every due date would show a day early. `receivedAt` is an instant with an explicit offset, for example `2026-10-23T09:14:00-04:00`.
- **Amounts:** `new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })` gives "$12,480.00", under the heading "Amount (CAD)". `en-US` would print "CA$12,480.00".
- **Unit tests** (`format.test.ts`, zone `America/Toronto`). Formatted strings are compared after `.replace(/\s+/g, ' ')`, because ICU may put a narrow no-break space before AM/PM.
  - `2026-10-25T19:42:00Z` → ID `PC-20261025-154200-001` and "Oct 25, 2026, 3:42 PM EDT";
  - `2026-10-26T04:00:00Z` → an ID starting `PC-20261026-000000-` (never `24`);
  - `2026-10-27T02:30:00Z` → an ID starting `PC-20261026-223000-` (the local day, not the UTC day);
  - a January instant → "EST";
  - `formatDateOnly('2026-10-30')` → "Oct 30, 2026".

#### Invariants
In one line: one function defines what valid saved data means, and both loading and every unit test use it, so "Ready to pay" can only ever mean a saved, full match. `src/kernel/invariants.ts`.

`checkInvariants(state, samples)` returns a list of problem codes, and an empty list means valid. It has two callers: the Store treats any problem as `invalid` on load, and every kernel unit test runs it on every result.

1. Every `requestId` is in the samples. IDs are positional: `attempts[i].id` is `A-` + (i + 1), and each record's `NNN` is its index + 1, so "count + 1" can never reissue an ID.
2. Per request, there's at most one `compared` attempt, and it's the last one. Nothing follows a saved `verified` attempt.
3. A `compared` attempt has `savedAt` and `recordId` set to null and has no record. Each `saved` attempt has exactly one record, linked both ways (`attempt.recordId` ↔ `record.attemptId`).
4. **Results are re-derived.** For every attempt with `stated` details, the answers pass the `missing` check, and `compareDetails(request.requested, stated)` equals the stored `results` and `outcome`. A `couldnt_verify` attempt has `stated: null` and all four results `not_checked`.
5. Each record repeats its attempt's outcome, results, stated details, person spoken to and reason. Its `requested` and `trustedNumber` equal the samples, and its `resultingPaymentStatus` is the one its outcome derives.
6. Each stored `timeZone` is accepted by `Intl.DateTimeFormat`. A bad one would throw during render and leave a blank page.

**Why:** an attempt's outcome is stored, and `deriveRequestView` trusts it. Re-deriving on load makes "Ready to pay" mean exactly what the PRD says: a saved attempt whose stated details match the request in full. That holds even if `samples.ts` was edited after an earlier run, or a bug wrote the wrong outcome. This guards consistency, not tampering: whoever uses this browser can edit localStorage, and the README says so.

**Append-only, checked:**
- Kernel unit tests deep-freeze every input state, so an in-place `state.records.push(...)` throws. That mutation would leave an unsaved record inside the "old" state the hook keeps after a failed save.
- `assertAppendOnly(prev, next)` runs after every action. Earlier records must be unchanged and in place. Earlier attempts must be unchanged, except for the single `compared → saved` step, which may change only `status`, `savedAt` and `recordId`.

#### Untrusted contacts in the email
In one line: everything the email offers as a way to reach the supplier is shown as inert, labelled text, because in this fraud those contacts lead to the fraudster. `untrusted.ts`. Implements `prd.md > Request review and untrusted contacts`.

- **Why inert text:** contacts stay visible, so you can see what was claimed, but they're never actionable.
- **Email content is text, never HTML.** From, subject and body render as React text children, which React escapes. Line breaks come from `white-space: pre-wrap`. Nothing in `src/` uses `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`, and `src/guards.test.ts` fails if one appears. That matters most for later: a live inbox is on the Later list, and rendering email as HTML is the classic way it becomes an injection hole.
- **`segmentEmailText(text, contacts)`** splits the subject and body into plain and untrusted segments.
  - It matches contacts literally (`indexOf`), never through a `RegExp` built from them, because a link's `.` or `?` would then match the wrong text.
  - It marks the longest contact first, with no overlaps, so `ap@harbourline-pay.example` is marked whole rather than only its domain.
  - Joining the segments always reproduces the input exactly (unit-tested), so marking can't drop or change a character.
- The From address is always one untrusted segment.
- Untrusted segments render as a `<span>` with the shield-slash icon and "untrusted—not used". They're never `<a>`, `tel:`, `mailto:` or a button. "Not used" means the app never offers that contact as the number to call. The README says the app can't stop someone dialling it by hand.
- **Completeness scan** (in `samples.test.ts`):
  1. Blank out the request's own `requested` values first. An account number in the body is a requested detail, not a contact.
  2. In from, subject and body, find every token containing `.example` and every phone shape `\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}`.
  3. Each one must be covered by a `contacts` entry.

  This proves no contact of those shapes is left unmarked. The samples never write a number out in words.

### Sample data
In one line: five invented suppliers, five payments and two change requests in `src/data/samples.ts`, built so that every check has something real to catch. Implements `prd.md > Overview and payment run`.

- **Five fictional suppliers**, each with a name, trusted on-file phone and on-file bank details.
- **Five payments this week**, each with a reference like `PR-2026-1043`, an amount in cents, a `dueDate` (`YYYY-MM-DD`) and an optional `requestId`.
- **Two change requests:**
  - **`req-mismatch`:** the email requests an account ending **9020**. The demo supplier will state **4471**.
  - **`req-legit`:** the email requests details the supplier will confirm.

  Each request has a from address, subject, `receivedAt` (with offset), body, a structured `contacts` list and structured `requested` details.
- Read-only. The app never writes back to it.
- **Fiction rules, each checked by `src/data/samples.test.ts`.** Several E2E checks only mean something if the data differs in the right places.
  - **Domains:** every domain, address and link ends in `.example` (RFC 2606: such a domain can't be registered or resolve). A lookalike such as `harbourline-pay.example`, against the supplier's `harbourline.example`, is fine.
  - **Phones:** every phone matches `^519-555-01\d\d$`: the 555-0100–0199 range kept for fiction, in Waterloo Region's area code.
  - **Institution numbers** avoid well-known assigned ones. The test rejects `001`–`004`, `006`, `010`, `016`, `030`, `039`, `614`, `815` and `828`. That list is a floor, not proof, and the README says so. The PRD's `"004"` vs `"4"` example stays a unit-test fixture and never appears in sample data.
  - **Names** are invented: no real bank or company. Supplier names avoid stock local words ("Grand River", "Conestoga", "Kitchener", "Waterloo") that real local businesses use.
  - Every requested and on-file institution, transit and account matches `/^[0-9]+$/`.
  - At least one on-file transit starts with `0`, for example `"01234"`.
  - Each email's phone numbers differ from that supplier's `onFilePhone`. Otherwise CB-1 couldn't tell the trusted number from the email's.
  - No requested institution, transit or account is a substring of the supplier name, the on-file phone, the script or the field labels. Otherwise CB-4 fails for the wrong reason; a 3-digit institution inside a phone number is the risky case.
  - The requested payee name may equal the supplier's name.
  - Each request changes the account, and `req-mismatch` requests one ending in `9020`.
  - There are 5 suppliers and 5 payments, exactly 2 payments have a `requestId`, and every ID resolves.
  - The contact completeness scan (`Untrusted contacts in the email`) passes.
- The README's "Try it" section says: "All suppliers, people, numbers and emails are invented: domains use the reserved `.example` and phone numbers the fictional 555-01xx range."

### Store
In one line: the only code that touches localStorage. One key, one whole-state write per action, read back before success is claimed, and it never throws. `src/storage/store.ts`, `src/storage/schema.ts`. Implements `prd.md > States and Boundaries` (Persistence) and your storage rules.

- **One key, namespaced:** `payee-check:v1`. The value is the JSON of `PersistedState`.
- **`load()`** returns one of:
  - `{ kind: 'empty' }` — the key is missing;
  - `{ kind: 'ok', state }`;
  - `{ kind: 'invalid', problem }` — bad JSON, a zod shape error, a `version` other than 1, or any `checkInvariants` problem;
  - `{ kind: 'unavailable' }` — storage throws.

  It never throws. `problem` goes only to `console.warn` and to tests, and the Recovery notice text never changes.
- **zod objects are `z.strictObject`,** so an unknown key makes the data invalid instead of being silently dropped by the next save.
- **No migration code,** because only one version exists. A breaking change would use a new key (`payee-check:v2`), so saved results are never re-judged by new rules.
- **`save(state)`: one action, one write of the whole state.** Compare, Save attempt and Couldn't verify each make exactly one `setItem('payee-check:v1', raw)` with the complete `PersistedState`.
  - Attempts and records share one value on purpose. localStorage has no transactions across keys, so "attempt marked saved, record missing" can't happen.
  - It reports success only if `getItem` then returns exactly `raw`. Otherwise it returns `{ ok: false, error: 'unavailable' | 'quota' | 'readback' }`. The banner text is the same for all three; the codes exist so tests can prove each path is reached.
- **`clear()`** uses `removeItem` on **only** `payee-check:v1`. First use and after-Reset are then the same `empty` load, and it works even when the stored value is invalid.
- **Lazy storage access:** `createStore(getStorage = () => window.localStorage)`. The getter is called **inside** each try/catch, because in Chrome even reading `window.localStorage` throws when site data is blocked. Vitest passes an in-memory fake that can be made to throw.

### App state hook
In one line: the bridge between the rules, the saving and the screens, and the one place that enforces "save first, show second". `src/app/useAppState.ts`.

- It holds the current `PersistedState` and the load result.
- **`compare`, `saveAttempt` and `couldntVerify` all work the same way:**
  1. Capture `now` once, then compute the next state with the kernel.
  2. `store.save(next)`.
  3. **Only on success**, put it into React state and navigate, using the returned `recordId` for the record view.
  4. On failure, keep the old state, stay on the same screen with the input intact, and show the error with **Try again**. Try again re-runs the same kernel action on the current state with a fresh `now`. It never re-sends a state computed earlier, so the saved time is when the save actually succeeded.
- **Synchronous from click to screen:** kernel → `setItem` → read-back → React state → navigate, with no `await` and no timers.
  - Actions read `stateRef.current`, which is updated in the same tick as a successful save.
  - Navigation sets the router's route in the same handler, so the next screen is drawn before a second click can land.
  - A double-click on Compare or Save attempt reaches the kernel with fresh state and is refused.
- **Refusals:**
  - `missing` → name the fields and keep the typing.
  - `verified`, `pending_comparison` or `not_compared` → the screen was out of date (a double-click, a second tab). Nothing is saved, no error shows, and the route is re-resolved with `replaceState`.
  - `unknown_*` → `#/`.
- **`resetDemo`** calls `store.clear()`, not `save`. On success:
  - the state becomes empty;
  - the load result becomes `empty`, which also ends the Recovery notice;
  - the error banner clears;
  - the route is replaced with `#/`, and focus moves to the Overview `<h1>`.

  On failure, the error banner shows and nothing changes.
- It never shows "Saved", "Verified" or "Ready to pay" from a state that wasn't written.

### Router
In one line: a tiny hash router whose single guard function makes sure a reload, a stale link or the browser's Back button can never reopen something it shouldn't. `src/app/routes.ts`.

| Route | Screen |
|---|---|
| `#/` | Overview |
| `#/request/:id` | Request detail |
| `#/request/:id/call` | Call-back step |
| `#/request/:id/compare` | Comparison |
| `#/record/:recordId` | Record view |

Every guard lives in one pure function, `resolveRoute(hash, state, samples)`, which reads `phaseOf` and returns the route to show. It's unit-tested in `routes.test.ts`, one row per guard.
- An unknown route shape, a request ID not in the samples, or a record ID not in the saved state → `#/`. This covers a stale `#/record/...` after Reset.
- `/request/:id` with a `compared` attempt → `/compare`.
- `/call` when a `compared` attempt exists → `/compare`.
- `/call` when the request is verified → `/request/:id`.
- `/compare` with no `compared` attempt → `/request/:id`.

**Redirects replace the history entry.** They use `history.replaceState` and set the router's route directly, because `replaceState` doesn't fire `hashchange`. Pushing a new entry instead would trap the browser's Back button between `/call` and `/compare`. Ordinary navigation pushes. Back buttons in the app go to `#/`, or to the request from a record.

**Focus, title and scroll on every screen change.** Each screen renders one `<h1 tabIndex={-1}>` inside `<main>`, with `aria-describedby` pointing at its status line (`Screen contract`).
- When the resolved route changes (a click, browser Back or Forward, or a guard redirect), one `useEffect` in `App.tsx`, keyed on the route, does three things:
  1. sets `document.title`;
  2. scrolls to the top;
  3. focuses `main h1`.
- On first load it only sets the title, because a screen reader already starts reading from the top.
- CSS: `[tabindex="-1"]:focus { outline: none }`, because the heading isn't a control.
- *Why:* the button just pressed (Compare, Save attempt) disappears, so focus falls to `<body>`. A keyboard user's next Tab starts again at the top of the page, and a screen-reader user hears nothing at the …4471 vs …9020 moment. Hash navigation also keeps the old scroll position, so a request opened from low on the Overview would open mid-page.
- **In-place changes keep focus near the action:**
  - refused Compare → the missing-answers summary;
  - failed save → focus stays on the button that was pressed, and the alert announces;
  - Couldn't verify opened → its reason field;
  - Reset dialog → Cancel; Cancel or Esc → back to "Reset demo";
  - a successful Reset → the Overview `<h1>`.

### Screen contract
In one line: every screen has one heading, one thing it announces, and at most one filled "next action" button, chosen on purpose. Implements `prd.md > Look and Feel` ("one obvious next action per screen").

`document.title` is the `<h1>` text + " — Payee Check". The Overview's title is "Overview — Payee Check".

| Screen | `<h1>` | Announced with the heading (`aria-describedby`) | Primary (filled navy, at most one) | Secondary (outlined or link) |
|---|---|---|---|---|
| Overview | "Payee Check" | who-it's-for line, fictional-data label | none: the next action is a flagged row's "Review request" link | "Reset demo", below both tables |
| Request detail (unresolved) | "Bank-change request: <supplier>" | hold status (+ reason) | "Start call-back" / "Try verification again" | "Back" |
| Request detail (verified) | same | "Verified", "Ready to pay" | "View/Print record" | "Back" |
| Call-back step | "Call-back: <supplier>" | the trusted-number line | "Compare" | "Couldn't verify" (while its panel is open, the panel's "Save attempt" is primary and Compare is outlined) |
| Comparison | "Comparison: <supplier>" | overall line + hold line | "Save attempt" | "Back" (navigation only; the locked result stays) |
| Record | "Verification record <recordId>" | outcome, resulting payment status | "Print" | "Start a new call-back attempt" (when allowed), "Back to request", "Back to overview" |
| Recovery notice | "Payee Check" | the Recovery message | "Reset demo" | — |

- **The Overview has no filled button.** The only work waiting is a flagged request. A filled "Reset demo" would make the one destructive action the loudest thing on the page.
- **Print is the record's primary for all three outcomes.** The loop ends "save and print" (`scope.md > The Core Loop`). A mismatch most likely means fraud, so a filled "Start a new call-back attempt" would invite calling until it matches. It stays available, but secondary.
- **DOM order = visual order, primary first.** There's no CSS `order` or `row-reverse`, so Tab order always matches what you see.
- **"Back" links carry a visually hidden destination** (accessible name "Back to overview"). A screen reader's links list then never shows several identical "Back"s, while the visible word stays the PRD's "Back".

### Overview screen
In one line: this week's payments at a glance, with the two that need attention made obvious and everything else visibly inert. `src/screens/Overview.tsx`. Implements `prd.md > Overview and payment run` and `prd.md > Reset demo`.

- Header: the who-it's-for line, the fictional-data label and the no-AI note (`Copy rules`).
- **Supplier book table:** name, trusted phone, institution, transit, masked account.
- **Payment run table:** supplier, reference, amount (CAD), due date, status badge, request ("Review request" link, or "None").
  - Flagged rows carry the stretched link (`Accessibility basics`).
  - Other rows have no link, no hover state and no pointer cursor, and show "Scheduled".
  - "Simulated—no money moves." sits beside any "Ready to pay".
- "Reset demo" (secondary) sits below both tables and opens the **Reset dialog**.

### Request detail screen
In one line: the email's claim beside what's on file, so you see exactly what would change, and the one action that starts the check. `src/screens/RequestDetail.tsx`. Implements `prd.md > Request review and untrusted contacts` and `prd.md > Retrying and reopening`.

- **Unresolved:**
  - the Email view;
  - an existing-vs-requested table, in full and monospaced (never masked);
  - the hold status, plus the reason after a saved couldn't-verify attempt;
  - saved attempts, each with its outcome, saved time and record link;
  - "Start call-back", or "Try verification again" once an attempt exists.
- **Pending comparison:** the guard sends you to `/compare`.
- **Verified:** read-only. The saved result, "Simulated—no money moves.", "View/Print record" and "Back", with no call-back and no fields.

### Call-back step screen
In one line: the screen you use during the phone call. It holds the trusted number, the script and five blank fields, and it's built so the email's claim can't reach it. `src/screens/CallbackStep.tsx`. Implements `prd.md > Trusted call-back`.

- **Request-blind by type:** the screen's props are a `CallbackView` (`requestId`, `supplierName`, `trustedNumber`) built by `callbackView(requestId, samples)`, and the script is a constant. The email and the requested values can't reach this screen even by mistake.
- **The trusted number** appears once, as monospaced plain text (never `tel:`), with the shield-check icon.
- **The PRD's exact script,** followed by the honesty line "Hiding the email doesn't prove the call was independent." (`Copy rules`).
- **Five blank inputs,** never prefilled, labelled exactly as in the PRD: "Account-holder/payee name", "Institution number", "Transit/branch number", "Full account number", "Name of person spoken to".
  - Each is `type="text"` with `autoComplete="off"` and `aria-required="true"`. The four number fields add `inputMode="numeric"` and the monospaced font.
  - Never `type="number"`: its value is `""` whenever the text isn't a valid number. "1234 567" typed with a space would arrive blank and be refused as missing, contradicting the PRD's spacing rule.
- **No `<form>`, and every button is `type="button"`.** Compare locks for good, so only a deliberate press of Compare may trigger it, never an Enter typed out of habit in the middle of a field. With no form, there's also no browser validation bubble (which names only one field), and no form submission for Chrome to remember. So a retry's fields can't offer the previous attempt's values; `autoComplete="off"` is the backup.
- **Compare is never disabled.** A disabled button can't be focused and gives no reason.
  - Pressed with blanks, it shows the missing-answers summary above the fields, focused (`tabIndex={-1}`).
  - The summary has one `<button type="button">` per missing label, which focuses that input. These are buttons, not `<a href="#field">`, because an in-page anchor would change the hash route and lose the typing.
  - Each blank input gets `aria-invalid="true"` and an inline "Missing" with the cross icon.
- **Couldn't verify** is a disclosure button (`aria-expanded`). It reveals a `<fieldset>` with `<legend>Couldn't verify</legend>`, the "Reason (optional)" `<textarea>`, and the panel's own **Save attempt**, so the two "Save attempt" buttons are never confused.
  - Focus moves to the reason field, and closing the panel keeps what was typed.
  - It never requires the person spoken to. Whatever is typed there is kept for the record.

### Comparison screen
In one line: the moment of truth. Your locked answers beside the email's claim, field by field, with the difference impossible to miss and the payment still held until you save. `src/screens/Comparison.tsx`. Implements `prd.md > Comparison rules`.

- Reads the locked attempt from state. A table shows each field with three columns: requested (email), stated (supplier) and result. All values are in full and monospaced, never masked.
- A mismatching row is red, with the cross icon and "Does not match". Matches show the check and "Matches".
- **The overall line** (`Copy rules`), for example "Full account number does not match: supplier said …4471, email requested …9020." Beneath it: "Payment still on hold—save this attempt to record the result."
- Read-only text, no inputs. One action: **Save attempt**.

### Record view
In one line: the dated, printable evidence of one attempt, laid out as a business form. `src/screens/RecordView.tsx`. Implements `prd.md > Verification records`.

- Every record field, laid out as in `Print`:
  - the account is masked;
  - couldn't-verify fields show "Not checked";
  - "Simulated—no money moves." appears beside "Ready to pay";
  - the honesty line "This record shows what was entered and when. It doesn't prove a call took place." appears under the outcome, on screen and in print.
- **Print** (primary) calls `window.print()`.
- "Start a new call-back attempt" appears after a saved mismatch or couldn't-verify, when `canStartAttempt` is true. "Back to request" and "Back to overview" are also there.

### Shared pieces
`src/components/`:

| Component | What it does |
|---|---|
| `StatusBadge` | colour + icon + words, `data-testid="status"` |
| `Icon` | the inline SVG set (`aria-hidden`, `currentColor`) |
| `MaskedAccount` | renders `<span aria-hidden="true">…9020</span><span class="visually-hidden">account ending 9020</span>`. ARIA 1.2 doesn't allow `aria-label` on a plain `<span>`, so screen readers might read "…9020" or nothing |
| `EmailView` | renders the email with untrusted segments marked |
| `ResetDialog` | a native `<dialog>` with "Cancel" (focused on open) and "Yes, reset". Cancel or Esc changes nothing |
| `ErrorBanner` | always mounted, `role="alert"`, keyed message plus the recovery action. Also used for the static "can't save" notice |
| `RecoveryNotice` | replaces the app when saved data is invalid |

## Data Model
In one line: the sample data is fixed, your activity is a list of attempts plus a list of records, and everything else is worked out from those two lists.

All types live in `src/kernel/types.ts`. zod schemas in `src/storage/schema.ts` mirror the persisted parts.

```ts
type BankDetails = { payeeName: string; institution: string; transit: string; account: string } // all strings
type Supplier   = { id: string; name: string; onFilePhone: string; onFile: BankDetails }
type Payment    = { id: string; ref: string; supplierId: string; amountCents: number; dueDate: string /* YYYY-MM-DD */; requestId?: string }
type Contact    = { kind: 'phone' | 'email' | 'link'; value: string }
type ChangeRequest = { id: string; supplierId: string; paymentId: string;
  email: { from: string; subject: string; receivedAt: string /* ISO with offset */; body: string; contacts: Contact[] };
  requested: BankDetails }

type FieldKey    = 'payeeName' | 'institution' | 'transit' | 'account'   // the four compared details
type AnswerKey   = FieldKey | 'personSpokenTo'                            // everything Compare requires
type FieldResult = 'match' | 'mismatch' | 'not_checked'
type Outcome     = 'verified' | 'mismatch' | 'couldnt_verify'
type Answers     = BankDetails & { personSpokenTo: string }                // what the Call-back form collects

type Attempt = { id: string /* A-001 */; requestId: string; status: 'compared' | 'saved'; outcome: Outcome;
  stated: BankDetails | null /* exactly as typed; never normalised; null for couldnt_verify */;
  personSpokenTo: string | null; results: Record<FieldKey, FieldResult>; reason: string;
  comparedAt: string | null; savedAt: string | null; recordId: string | null /* null while compared */ }

type VerificationRecord = { id: string /* PC-YYYYMMDD-HHMMSS-NNN */; attemptId: string; requestId: string;
  savedAt: string /* ISO UTC */; timeZone: string;
  supplierName: string; paymentRef: string; amountCents: number; dueDate: string;
  emailRef: string /* subject + received date */; trustedNumber: string;
  personSpokenTo: string | null; requested: BankDetails; stated: BankDetails | null;
  results: Record<FieldKey, FieldResult>; outcome: Outcome; reason: string;
  resultingPaymentStatus: 'Ready to pay' | 'On hold—details do not match' | 'On hold—verification incomplete';
  label: 'Fictional sample data—no real call or payment' }

type PersistedState = { version: 1; attempts: Attempt[]; records: VerificationRecord[] }
```

| Data | Where it lives | How it's updated | When you leave and come back |
|---|---|---|---|
| Suppliers, payments, requests | `samples.ts` (code) | Never | Always the same |
| Attempts, including the locked `compared` one | localStorage `payee-check:v1` | Kernel action → `store.save`, success only | Reloaded, validated and invariant-checked; the locked comparison reappears |
| Records | Same key, same write | Created only by `saveAttempt` / `saveCouldntVerify` | Reloaded; earlier records never change |
| Payment and request statuses | Not stored; derived by `phaseOf` | Recomputed from samples + saved attempts | Always consistent with the attempts |
| Call-back typing before Compare | The screen's temporary memory only | Typing | Gone after Back or a reload (by design) |
| Current screen | The address bar hash | Navigation; guards replace | Restored by the Router, with guards |
| Error message | Memory only | A failed save or reset | Cleared by a successful Try again, a successful Reset, or leaving the screen |

## File Structure
In one line: rules in `kernel/`, saving in `storage/`, wiring in `app/`, screens in `screens/`, and every test next to what it proves.

```
payee-check/
├── index.html              # app shell; format-detection meta; <link rel="icon" href="data:,">; mounts #root
├── package.json            # exact pins; scripts: dev, build, preview, typecheck, test, e2e, check
├── package-lock.json       # written by npm install
├── .npmrc                  # legacy-peer-deps=true (npm 10.9 crashes resolving vitest 5's optional peers)
├── tsconfig.json           # strict; jsx react-jsx; types ["vite/client", "node"] (TS 6 defaults types to [])
├── vite.config.ts          # React plugin; server port 5180 + strictPort; Vitest (environment node, include src/**/*.test.ts)
├── playwright.config.ts    # testDir tests/e2e, channel 'chrome', workers 1, retries 0, forbidOnly,
│                           #   timezoneId America/Toronto, port 5180, webServer + reuseExistingServer
├── README.md               # what/who · Try it (supplier's lines + fiction line) · checks · Limits · provenance · AI disclosure
├── .gitignore              # existing rules + node_modules/, dist/, test-results/, playwright-report/
├── src/
│   ├── main.tsx            # React entry
│   ├── App.tsx             # load result → Recovery notice or Router → screen; ErrorBanner; focus/title/scroll effect
│   ├── styles.css          # tokens, layout, status styles, .visually-hidden, @media print
│   ├── copy.ts             # every user-visible string
│   ├── guards.test.ts      # static scan: no network APIs or external URLs, no HTML sinks
│   ├── look.test.ts        # token contrast; Avoid-list scan
│   ├── traceability.test.ts# Verification Map ↔ test titles; no .only/.skip
│   ├── kernel/             # the rules: pure functions, no React, no storage
│   │   ├── types.ts
│   │   ├── normalize.ts    # invisible chars, whitespace, NFC, case; isBlank
│   │   ├── compare.ts      # four-field comparison
│   │   ├── attempts.ts     # phaseOf, lock, save, couldn't verify, deriveRequestView, canStartAttempt
│   │   ├── record.ts       # buildRecord: the save-time snapshot
│   │   ├── format.ts       # record-ID parts, saved time, date-only, CAD
│   │   ├── mask.ts         # last-four display
│   │   ├── untrusted.ts    # email text → plain / untrusted segments
│   │   ├── invariants.ts   # checkInvariants, assertAppendOnly: what valid saved data means
│   │   └── *.test.ts       # Vitest, next to what they test
│   ├── data/
│   │   ├── samples.ts      # fictional suppliers, payments, two requests (read-only)
│   │   └── samples.test.ts # fiction rules and fixture preconditions
│   ├── storage/
│   │   ├── schema.ts       # zod strict schema for PersistedState
│   │   ├── store.ts        # load/save/clear on payee-check:v1; never throws
│   │   └── store.test.ts   # in-memory fake Storage, incl. throwing, quota, read-back and invalid cases
│   ├── app/
│   │   ├── useAppState.ts  # kernel + store + "save first, show second"
│   │   ├── routes.ts       # hash routes + resolveRoute guards (replaceState on redirect)
│   │   └── routes.test.ts
│   ├── screens/
│   │   ├── Overview.tsx
│   │   ├── RequestDetail.tsx
│   │   ├── CallbackStep.tsx
│   │   ├── Comparison.tsx
│   │   └── RecordView.tsx
│   └── components/
│       ├── StatusBadge.tsx
│       ├── Icon.tsx
│       ├── MaskedAccount.tsx
│       ├── EmailView.tsx
│       ├── ResetDialog.tsx
│       ├── ErrorBanner.tsx
│       └── RecoveryNotice.tsx
├── tests/
│   └── e2e/
│       ├── helpers.ts                  # auto fixture (network + console watch), checkScreen, seeds, failure switch,
│       │                               #   print stub, tabTo, fill answers, RECORD_FIELDS
│       ├── overview.spec.ts
│       ├── mismatch-journey.spec.ts
│       ├── verified-journey.spec.ts
│       ├── couldnt-verify.spec.ts
│       ├── lock-and-persistence.spec.ts
│       ├── retry.spec.ts
│       ├── masking-and-print.spec.ts
│       ├── reset.spec.ts
│       ├── storage-failure.spec.ts
│       ├── keyboard.spec.ts
│       └── no-network.spec.ts
└── devpost/                # scope, prd, spec, checklist (+ learner-profile.md, git-ignored)
```

The README's **Limits** section says:
- Records live only in this Chrome profile on this laptop. Clearing site data or Reset deletes them, and the printed record is the copy that lasts.
- Masking isn't encryption: the full fictional numbers sit in localStorage as plain text, and whoever uses this browser can edit them.
- Institution numbers avoid well-known assigned ones but weren't checked against the official list.
- The app can't guarantee independence or prove a call happened (`prd.md > States and Boundaries`). It locks the recorded answer before comparison and keeps every attempt.
- Two tabs open at once both write the same saved data, and the last write wins. Use one tab.

## External Services and Dependencies
In one line: none at runtime. The only outside things are the npm packages in `Stack`, installed once.

There are no APIs, accounts, keys, hosting or costs. Playwright uses the installed Chrome (`channel: 'chrome'`), so `npx playwright install` isn't needed. Key browser APIs:
- localStorage: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- `Intl.DateTimeFormat`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
- `<dialog>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
- `window.print`: https://developer.mozilla.org/en-US/docs/Web/API/Window/print
- `page.clock`: https://playwright.dev/docs/clock

## Important Failure Modes
In one line: the few ways this can actually break in front of someone, and exactly what they see instead of a wrong status.

- **Saved data is invalid** (bad JSON, wrong shape, or data that contradicts the rules) → the **Recovery notice** replaces the app: "Your saved demo data couldn't be read. Nothing has been shown from it." It offers **Reset demo** (with confirmation), which clears only `payee-check:v1`. The bad data isn't overwritten until you confirm, and no status is ever shown from it.
- **Storage can't be read** (the browser blocks localStorage) → the Overview shows the sample data with the static notice "This browser isn't letting Payee Check save. You can look around, but attempts can't be saved." Compare, Save attempt and Couldn't verify then fail as below.
- **A save fails** (blocked, full, or the read-back doesn't match):
  - **Compare:** the answers stay editable and unlocked, and no comparison is revealed.
  - **Save attempt:** the screen stays on the unsaved Comparison. No "Saved", "Verified" or "Ready to pay" appears.
  - **Couldn't verify:** the screen stays on the Call-back step with the reason and typing intact, and no record is shown.

  In every case the banner says "Couldn't save—nothing was changed." with **Try again**.
- **Reset can't clear storage** → the error banner says so, and the current state stays as it was.
- **Two tabs open at once** both write the same key, so the last write wins. This is a documented limitation, your choice on 2026-10-26: it's in the README's Limits, not engineered around.

## Verification Map
In one line: every PRD acceptance criterion has an ID, and every ID names the test that proves it, so "is it done?" has an answer anyone can check.

Every PRD acceptance criterion has a stable ID: a section prefix plus its position in that section of `prd.md`.
- **Prefixes:** OV Overview and payment run, RQ Request review, CB Trusted call-back, CR Comparison rules, OS Outcomes and payment status, VR Verification records, RT Retrying and reopening, RS Reset demo. SB covers `States and Boundaries` and `Important Failure Modes`, and LF covers `Look and Feel`.
- **Cell contents:** Unit cells name `src/**/<file>.test.ts`, and E2E cells name `tests/e2e/<file>.spec.ts`. H-n is a step of the `Hands-on review script`.
- **Shared checks:** "checkScreen" and "the fixture" are the every-screen checks in `helpers.ts`. A "guard" is a presence assertion made before an absence check.

| ID | Criterion (short) | Unit | E2E | Hands-on |
|---|---|---|---|---|
| OV-1 | First screen: who it's for, suppliers, payment run, no sign-in | — | `overview`: the exact who-it's-for line; 5 supplier and 5 payment rows; 0 password inputs; no "Sign in" or "Log in" | H-1 |
| OV-2 | Each payment row: supplier, amount, due date, status, attention indicator | `format`: CAD and date-only cases | `overview`: all cells non-empty in every row; amounts like `$1,234.56`; each due date shows the same calendar day as its `dueDate`; indicator on exactly the 2 request rows | — |
| OV-3 | Exactly two rows flagged, "On hold—verification needed" | `attempts`: no attempts → that string | `overview`: exactly 2 flagged rows, exact text | — |
| OV-4 | Non-request rows neutral, non-interactive, open nothing | `attempts`: no request → "Scheduled" | `overview`: 3 rows read "Scheduled", with no `a` or `button` and a cursor other than `pointer`; clicking one stays on the Overview | H-1 |
| OV-5 | Supplier book: name, trusted phone, on-file details | — | `overview`: each supplier's name, phone, institution and transit in its row; the leading-zero transit intact | — |
| OV-6 | Overview accounts show the last four only | `mask`: `"12349020"` → `"…9020"` (U+2026); `"12 3490 20"` → `"…9020"` | `overview`: guard, then `page.content()` (text and attributes) holds no full on-file or requested account; account cells are `…` + 4 digits | — |
| OV-7 | Fictional-data label and no-AI note | — | `overview`: both exact strings (`Copy rules`); every record and the Call-back step also show their honesty lines | — |
| RQ-1 | Email, existing vs requested in full, hold status | — | `mismatch-journey`: From, subject, body; both accounts in full in a monospaced font; hold status | — |
| RQ-2 | Email contacts marked untrusted, not links, never the number to call | `untrusted`: segments rejoin to the input; longest contact first; `samples`: contact scan | `mismatch-journey`: guard (From visible); 0 `a`, `img`, `iframe` or `form` in the email panel; From and every contact inside an "untrusted—not used" element; checkScreen | — |
| RQ-3 | Back to Overview; attempts, locked comparison, statuses unchanged | — | `lock-and-persistence`: from a pending comparison, Back → Overview; statuses the same; stored `payee-check:v1` byte-identical | — |
| CB-1 | Only phone on the step is the on-file one | `samples`: email phones ≠ on-file phone | `mismatch-journey`: the only phone-shaped text on the page is the on-file number | — |
| CB-2 | Exact script | — | `mismatch-journey`: exact PRD text | — |
| CB-3 | Five labelled fields, blank, never prefilled | — | `mismatch-journey`, `retry`: `getByLabel` finds each exact PRD label; each `toHaveValue('')`; 0 `input[type=number]` | — |
| CB-4 | Email and requested details not visible | `samples`: requested values not inside the supplier name, phone, script or labels | `mismatch-journey`, `retry`: guard (script visible), then From, subject, body, contacts and the requested institution, transit and account are absent | — |
| CB-5 | Nothing starts a call | — | checkScreen (every `a[href]` starts with `#/`); format-detection meta present | — |
| CB-6 | Couldn't verify always available; person not required | `attempts`: blank person → `null` | `couldnt-verify`: visible on arrival and after a refused Compare; saves with the person blank | — |
| CB-7 | Back before Compare discards typing; saved attempts unchanged | — | `lock-and-persistence`: type all five, Back, return → all empty; stored value byte-identical | — |
| CR-1 | Compare needs all five and names the missing ones; missing never verifies | `attempts`: each single blank, all blank, whitespace-only, NBSP-only and zero-width-only → `missing` with exactly those keys | `mismatch-journey`: account blank → the summary is focused and names "Full account number"; still on `/call`; stored value unchanged | — |
| CR-2 | Compare locks; nothing editable; no compare again | `attempts`: second `lockAndCompare` → `pending_comparison`; `routes`: `/call` + pending → `/compare` | `lock-and-persistence`: Enter in the last field doesn't compare; after Compare, 0 `input, textarea, select, [contenteditable]`; hash `/call` lands on `/compare`; browser Back ×3 reaches the Overview without ever showing an input | — |
| CR-3 | All four compared in full; every account digit | `compare`: same last four, earlier digit differs → mismatch; each field differing alone | `mismatch-journey`: full values in the table | — |
| CR-4 | Leading zeros count | `normalize`: `"004"` ≠ `"4"`; `"01234"` = `"01234"` | `overview` (same test as OV-5) | — |
| CR-5 | Harmless spacing ignored | `normalize`: space, tab, NBSP, narrow NBSP, zero-width → match; `"1234-567"`, `"O1234"`, full-width digits → mismatch | — | — |
| CR-6 | Names: case and whitespace only | `normalize`: case, outer and inner spaces, NFD vs NFC → match; `"Ltd"`/`"Limited"`, `"Ltd."`/`"Ltd"`, `"Société"`/`"Societe"` → mismatch | — | — |
| CR-7 | Per-field results; red + words + icon; …4471 vs …9020 | — | `mismatch-journey`: account row "Does not match", cross icon, colour `rgb(163, 36, 42)`; other rows "Matches"; exact overall line, which is also the accessible description of `main h1` | H-2, H-3 |
| CR-8 | Masking is display only | `compare`: the same-last-four case; the overall line shows full values when the last four are equal | `mismatch-journey`: the Comparison shows both accounts in full | — |
| CR-9 | Unsaved comparison survives Back and reload, still locked | `store`: round trip keeps the `compared` attempt | `lock-and-persistence`: reload on `/compare`, and reopen from the Overview → same text, 0 inputs | — |
| OS-1 | Match: "Details match."; held until Save; then Verified / Ready to pay | `attempts`: unsaved `verified` → still "On hold—verification needed" | `verified-journey`: after Compare the row still reads exactly that; after Save, "Verified" and "Ready to pay" | — |
| OS-2 | Mismatch: held; save, print, new attempt | `attempts`: saved mismatch → "On hold—details do not match" | `mismatch-journey`: exact string on the Overview and Request detail; Print calls `window.print` once; "Start a new call-back attempt" present | — |
| OS-3 | Couldn't verify: reason, incomplete, save, retry | `attempts`: status + reason; blank → "No reason recorded" | `couldnt-verify`: reason "No answer" → exact status + reason; retry offered; double-clicking Save attempt makes exactly one record | — |
| OS-4 | No new attempt while a comparison is unsaved | `attempts`: one row per lifecycle-table cell | `lock-and-persistence`: the request opens on `/compare`, with no start, retry or Couldn't verify control | — |
| OS-5 | Save, print, Back, reload never clear a hold | — | `mismatch-journey`: after Save, Print, Back and reload → exact mismatch status | — |
| OS-6 | "Ready to pay" is simulated; app says no money moves | — | `verified-journey`: "Simulated—no money moves." beside every "Ready to pay" (Overview, Request detail, record) | — |
| VR-1 | A record per save; earlier ones never change | `attempts`: deep-frozen inputs; `assertAppendOnly` after every action; record 1 `toEqual` its earlier copy; IDs differ | `retry`: after the mismatch request is retried and verified, record 1 still reads "On hold—details do not match" while the Overview reads "Ready to pay" | — |
| VR-2 | Record shows every PRD field | `record`: every field present; `format`: exact ID and time | each journey: every item of `RECORD_FIELDS` (helpers) shown; ID `PC-20261025-154200-001` and "Oct 25, 2026, 3:42 PM EDT" from the fixed clock | — |
| VR-3 | Couldn't-verify: "Not checked", never "Match" | `attempts`: four `not_checked`, `stated: null` | `couldnt-verify`: "Not checked" ×4, "Matches" ×0 | — |
| VR-4 | Records mask the account (screen and print); institution, transit full | `mask`; `record`: same last four → "Does not match (differs before the last four digits)" | `masking-and-print`: guard (record ID), then `page.content()` holds no full requested or stated account, on screen and under print media; `…9020`, `…4471`, and the full institution and transit present | — |
| VR-5 | Prints as a clean black-and-white form | — | `masking-and-print`: print media hides the header, buttons and banners; label, outcome words and icons visible; the A4 and Letter PDFs are one page each | H-4 |
| VR-6 | Records and statuses unchanged after reload | `store`: round trip deep-equal | both journeys: reload → same record text, Overview status and (verified) read-only detail | — |
| RT-1 | Unresolved: hold reason, attempts, "Try verification again"; record offers "Start a new call-back attempt" | `attempts`: can start after a saved mismatch or couldn't-verify | `retry`: attempt listed with its record link and reason; both buttons reach a blank `/call` | — |
| RT-2 | New attempt blank, email hidden, nothing copied | — | `retry`: no attempt-1 answer in any attempt-2 input; CB-4 check repeated | — |
| RT-3 | Verified reopens read-only | `routes`: `/call` when verified → `/request/:id`; `attempts`: `lockAndCompare` → `verified` | `verified-journey`: 0 inputs, no start or retry; "View/Print record" and "Back"; hash `/call` → detail | — |
| RT-4 | All states unchanged after reload | `routes`: one row per guard (target, and replace vs push) | `retry`, `verified-journey`: reload in each state → same screen and text | — |
| RS-1 | Confirmation first | — | `reset`: the dialog opens with Cancel focused; stored value unchanged while it's open | — |
| RS-2 | Confirm clears attempts and pending comparison; samples restored | `store`: `clear()` leaves `other-site:keep` | `reset`: seeded pending comparison + `other-site:keep` → Confirm → 2 × "On hold—verification needed", 0 records, the request opens on detail, `other-site:keep` still there | — |
| RS-3 | Cancel changes nothing | — | `reset`: Cancel and Esc → stored value byte-identical; same statuses | — |
| SB-1 | Invalid data → Recovery notice; nothing shown from it; kept until Reset is confirmed | `store`, `invariants`: one failing fixture per problem: bad JSON, `version: 2`, an extra key, an unknown `requestId`, a saved `verified` with a one-digit account difference, two `compared` attempts, an attempt after `verified`, an attempt-ID gap, `timeZone: 'Mars/Base'` | `storage-failure`: seeded `{not json` → notice; no status string; stored value unchanged until Confirm | — |
| SB-2 | Storage unreadable → runs with the "can't save" notice | `store`: getter throws → `unavailable`; `save` → `ok: false` | `storage-failure`: getter throws → Overview + exact notice | — |
| SB-3 | Failed save: no Saved / Verified / Ready to pay, input kept, Try again works | `store`: `setItem` throws → `quota` or `unavailable`; read-back differs → `readback` | `storage-failure`: at Compare, Save attempt and Couldn't verify → "Couldn't save—nothing was changed.", same URL, input intact, none of the three words; failure switched off → Try again succeeds | — |
| SB-4 | No external network | `guards`: no network API and no non-`.example` URL in `src/` or `index.html` | the fixture in every spec: no request or websocket beyond `localhost`, `127.0.0.1`, `[::1]`, `data:` or `blob:`; `no-network`: both journeys, with a guard of at least 1 localhost request | — |
| SB-5 | Reset can't clear → banner, state kept | `store`: `removeItem` throws → `ok: false` | `storage-failure`: `removeItem` throws → banner; statuses unchanged | — |
| LF-1 | Status = colour + icon + words | — | checkScreen, also under print media | H-2 |
| LF-2 | One obvious next action per screen | — | checkScreen (at most 1 visible primary); `keyboard`: the mismatch journey and a Reset by keyboard only, with `main h1` focused on every screen | H-1, H-6 |
| LF-3 | Avoid list; reduced motion; AA contrast; monospaced numbers | `look`: contrast of every token pair; Avoid-list scan | the RQ-1 font check | H-5 |
| LF-4 | Calm, practical, trustworthy register | — | — | H-1, H-3, H-5 |

54 IDs: 45 PRD criteria, 5 SB and 4 LF. Only LF-4 rests on the hands-on review alone.

### How the map stays true
In one line: the map is checked by a test, so it can't quietly claim coverage that no longer exists.

- **Test titles carry IDs.** Every test title starts with the IDs it proves, for example `test('CR-3 CR-8 same last four, earlier digit differs → mismatch', …)`. Table-driven tests title each row `test.each(cases)('$id $name', …)`. One criterion then runs on its own: `npx vitest run -t "CR-3"` or `npx playwright test -g "CR-3"`.
- **Unit tests are tables of named cases.** Inputs are deep-frozen, and a new edge case is one more row. PRD strings are written out literally in tests, em dashes included, and never imported from app code, so the app and its test can't share a typo.
- **`src/traceability.test.ts`** (Vitest, `node:fs`, about 30 lines) reads the table above from `devpost/spec.md` and reads every test file. It fails when:
  - an ID with a Unit entry has no Vitest title starting with it, or an ID with an E2E entry has no Playwright title starting with it;
  - a test names an ID that isn't in the table;
  - an ID whose only proof is hands-on isn't named by any H-step;
  - a test file contains `.only(`, `.skip(`, `.fixme(` or `.todo(`.
- **Evidence:** a checklist step's evidence is the end of the real run as printed: Vitest's and Playwright's pass counts, with 0 skipped and 0 flaky.

### E2E isolation, determinism and every-screen checks
In one line: every end-to-end test starts clean, uses a fixed clock, and re-checks the app-wide rules on every screen it visits.

- **Fresh state per test:** each test gets its own browser context, so localStorage starts empty. There's no `test.describe.serial`, and any test passes when run on its own.
- **Seeding mid-journey states:** use `test.use({ storageState })`, with the `payee-check:v1` value built by the kernel functions and a fixed `ctx` (`seedPendingComparison()` and `seedSavedMismatch()` in `helpers.ts`). Seeds then always pass the schema and `checkInvariants`.
  - Never seed with `addInitScript`: it re-runs on every reload and would overwrite what the app saved, so a reload test would pass without testing anything.
  - The two Success journeys always go through the UI.
- **Failure injection** does use `addInitScript`, because it must survive reloads. `setItem` and `removeItem` throw while `window.__failSaves` is true, and the test flips the flag with `page.evaluate` to prove Try again recovers. For blocked storage, the `localStorage` getter throws.
- **Fixed clock:** call `await page.clock.setFixedTime(new Date('2026-10-25T19:42:00Z'))` before the first `goto`. A record then has an exact ID (`PC-20261025-154200-001`) and time ("Oct 25, 2026, 3:42 PM EDT") to assert.
- **`window.print`** is stubbed in `addInitScript` to count calls.
- **Selectors:** `getByRole` and `getByLabel` with the PRD's exact names first, `data-testid` only where no stable name exists, and never CSS classes or DOM position. A role or label selector is itself a check: rename a button or drop a label, and the test can't find it. Use web-first assertions only, never `waitForTimeout`.
- **One automatic fixture in every spec.** `helpers.ts` exports a `test` with an `{ auto: true }` fixture, and every spec imports that `test`. It fails the test on:
  - any request or websocket to anything except `localhost`, `127.0.0.1`, `[::1]`, `data:` or `blob:`;
  - any `console.error` or uncaught `pageerror`. React reports missing keys and invalid props there, and handled failures log at `warn`, not `error`.
- **`checkScreen(page)`** runs after every screen change. It checks that:
  - every `a[href]` starts with `#/`, so there's no `tel:`, `mailto:` or external link;
  - at most one `.btn-primary` is visible;
  - every `[data-testid="status"]` holds an `svg` and non-empty text;
  - the page text contains no `NaN`, `undefined` or `[object Object]`;
  - after an in-app navigation, `main h1` is focused and the title matches the `Screen contract`.
- **Flake check,** once at the end of the build: `npx playwright test --repeat-each=3` passes, still with one worker.

### Proving the checks can fail
In one line: a passing test counts only if it could have failed, so each core rule is deliberately broken once to watch its test turn red.

- **Guard before absence.** Before every "X is not on the page" assertion, assert something that must be on that same screen:
  - the script, before "requested values absent" (CB-4, RT-2);
  - the From address, before "no links in the email panel" (RQ-2);
  - the record ID, before "no full account" (VR-4, OV-6);
  - at least one localhost request, before "no external request" (SB-4).

  Without the guard, a blank or crashed page passes every absence check.
- **Deliberate-break pass,** done once by hand after the suite is green (a mutation-testing tool would be a new dependency). For each row:
  1. make the one-line break;
  2. run only that ID (`-t` / `-g`) and confirm it fails on the expected assertion;
  3. revert, and confirm it's green again.

  Log each one as `B-n · break · failing test · first failure line` in `devpost/checklist.md`. If a break doesn't fail its test, fix the test first.

| # | Break | Must fail |
|---|---|---|
| B-1 | `normalizeNumber` returns `String(Number(x))` | CR-4 |
| B-2 | `compareDetails` compares `account.slice(-4)` only | CR-3 |
| B-3 | status derived from the latest attempt, saved or not | OS-1 (unit and E2E) |
| B-4 | `useAppState` updates state and navigates before `store.save` | SB-3 |
| B-5 | `EmailView` renders a contact as `<a href>` | RQ-2 |
| B-6 | `CallbackStep` renders `requested.account` | CB-4 |
| B-7 | couldn't-verify results set to `'match'` | VR-3 |
| B-8 | the router redirects with `pushState` | CR-2 (Back ×3) |
| B-9 | Reset calls `localStorage.clear()` | RS-2 |

### Hands-on review script
In one line: ten minutes in Chrome, six yes/no questions, for the things only a person can judge.

It runs after `npm run check` is green and the demo has been reset. Answer each question yes or no; any no becomes a revision task. Record `H-n: yes/no + your note` under the checklist's Hands-on Checkpoints. The agent never fills these in.
- **H-1 Glance** (OV-1, OV-4, LF-2, LF-4): at full width, can you point to the two payments that need attention within 5 seconds? Is it obvious the other three rows aren't clickable? On every screen, is there one obvious next step?
- **H-2 Colour off** (LF-1, CR-7): in DevTools, open Rendering › Emulate vision deficiencies › Achromatopsia. On the Overview and the mismatch Comparison, can you still tell verified, held and mismatch apart by icon and words alone?
- **H-3 The demo beat** (CR-7, LF-4): on the mismatch Comparison, is the …4471 vs …9020 line the first thing your eye lands on?
- **H-4 Print** (VR-4, VR-5): open the A4 and Letter PDFs in `test-results/`, then press Print once on the couldn't-verify record with Background graphics off. Is each one page? Does it read as a business form? Can you find the record ID, the date and time with zone, the outcome and `…9020` within 10 seconds?
- **H-5 Feel and copy** (LF-3, LF-4): across every screen, is there any gradient, emoji, tile, chart, or motion beyond a focus fade? Is there any wording that sounds like marketing rather than a form?
- **H-6 Keyboard** (LF-2): can you finish the legitimate journey with Tab, Shift+Tab, Enter and Space only, with the focus ring always visible?

## What Was Simplified and Why
In one line: the simpler choice was made on purpose each time, and here is what the fuller version would have cost.

- **localStorage** instead of a database or server. One user and fictional data, and it's your choice. A server would add a process to run and a failure mode to debug without proving anything about the call-back.
- **localStorage's synchronous API is a feature here.** `setItem` has finished or thrown before the next line runs, so "save first, show second" needs no loading state, spinner or half-saved screen. IndexedDB is asynchronous and would need all three.
- **Statuses derived, not stored.** Recomputing from saved attempts means a status can never disagree with the records. Storing them would need code to keep two copies in sync.
- **A tiny hash router** instead of a router library. Five routes and one guard function don't justify another dependency.
- **No component-test library.** Screens are proven by Playwright in real Chrome, and the rules by Vitest on the kernel. This avoids jsdom, a simulated browser that adds a dependency and its own quirks.
- **No mutation-testing tool.** The nine-row deliberate-break pass proves the key tests can fail, without a new dependency.
- **No migrations.** One schema version exists, and anything else gets the Recovery notice. A future version would use a new key.
- **No quota handling, export or backup.** A demo writes a handful of small records. A full store is an ordinary failed save, and the printed record is the copy that lasts.
- **No Content-Security-Policy.** Under Vite's dev server, a CSP needs `'unsafe-inline'` and the exact reload-socket origin. That would add a way to break the dev loop, while proving nothing the static scan and the every-spec network watch don't already prove.
- **Fixed sample data in code.** That's your scope decision: no supplier editing, no inbox, no AI.
- **System fonts and an inline SVG icon set.** Nothing is fetched, so the no-network check stays true.

## Decisions and Open Issues
In one line: what you decided, what the agent derived from it, and the few questions still open for you.

**Your choices (this conversation):**
- TypeScript + React + Vite, with exact pins checked against Node 22.14.0, and Node kept as it is.
- The comparison and status rules are separate from the screens (the kernel) and tested directly. Bank identifiers are strings throughout.
- localStorage, persisting the complete attempt state, including locked answers and a pending comparison. The lock is written **before** the comparison is revealed.
- A namespaced key, and Reset demo clears only Payee Check's data.
- Invalid or failed storage gets a clear error and a recovery action, never a "Saved", "Verified" or "Ready to pay" that wasn't saved.
- Three check layers (Vitest, Playwright on installed Chrome, the type check), with your eight focused checks (all in `Verification Map`). Visual polish and print readability are a hands-on review. No extra testing frameworks.
- "Mastery" pass: every part simple on the surface, with a stated reason and a named proof underneath.
- Carried forward:
  - local only (no deployment);
  - no AI model or keys;
  - fictional, read-only samples;
  - the app never places a call.

**Your answers to the depth-pass questions (2026-10-26):**
1. zod: yes.
2. A stray character in a number field shows as a mismatch. Compare doesn't add a digits-only refusal, and the PRD is unchanged.
3. Two tabs: a documented limitation (last write wins).
4. Honesty lines: yes, on every record and under the call script. The AI note reads "No AI model runs in this app…".
5. The same-last-four wording on masked records: yes.

**Agent-derived implementation details** (they follow from your choices; change any you like):
- Port 5180.
- `phaseOf` and the lifecycle table.
- `KernelResult`.
- `ctx = { samples, now, timeZone }`.
- Invariants and append-only checks.
- One whole-state write with read-back.
- Lazy storage access.
- `resolveRoute` with replace-on-redirect.
- The Screen contract.
- Focus, title and scroll on every screen change.
- Copy rules and `copy.ts`.
- Design tokens with measured contrast.
- The print layout with a one-page PDF check.
- The fiction rules.
- The verification ID scheme, the traceability test, guards, the deliberate-break pass and the hands-on script.
- Five suppliers and five payments.
- "Scheduled" as the neutral status.

**One useful unknown: how a quality bar becomes checks an agent can run** (from your learning goal).
- **Clarified by** the `Verification Map`. Each PRD criterion has an ID and a named proof. The traceability test makes "every criterion is proven" itself a check, and the hands-on script is deliberately short: only what a machine can't judge.
- **Three patterns worth noticing:**
  - A rule like "an unsaved match leaves the payment held" is checked at two levels. A unit test proves the rule; an end-to-end test proves the screen obeys it.
  - "Never show Verified when the save failed" is only testable because the Store accepts a fake storage that can be told to fail. Making failure injectable is part of the design, not an afterthought.
  - A check only counts if it can fail. Absence checks get a presence guard, and the break log shows each core rule's test turning red when the rule is removed.
- **Evidence during the build:** each checklist step names the exact command and the expected output.

**Review history:**
- **2026-10-25/26:** a coverage and consistency review found 14 issues, all fixed. The toolchain points were checked directly:
  - Vitest 5 exports `vitest/config`;
  - npm's script shell is the default `cmd.exe`;
  - the only Chrome policy on this machine (`LocalNetworkAccessAllowedForUrls`) doesn't block automation.
- **2026-10-26 depth pass:** five read-only reviewers (rules; data and time; screens and accessibility; verification; trust and honesty) made 41 proposals. A critic kept 26, rejected 2 as redundant or risky, and sent 4 to you as questions.

**Open questions:** none. All five depth-pass questions were answered on 2026-10-26 (above).

**Install-time corrections (2026-10-26, after approval; internal, no change to what you get):**
- **zod 4.6.5 → 4.6.7.** `npm audit` flagged GHSA-mrhx-c7xc-m3w5 (high: memory exhaustion validating oversized constrained collections), affecting versions below 4.6.6. 4.6.7 (published 2026-10-12) is the fixed release, and `npm audit` now reports 0 vulnerabilities.
- **`.npmrc` with `legacy-peer-deps=true`.** npm 10.9.2 crashes ("Cannot read properties of null (reading 'edgesOut')") while resolving `vitest@5.0.3`'s optional peer dependencies. None of them is needed here (Vite and `@types/node` are installed directly). The file makes `npm install` and `npm ci` behave the same on a fresh clone. A clean `npm ci` was then verified: 49 packages added, 0 vulnerabilities.
- Peer-dependency warnings: none reported. The open item about them is closed.
