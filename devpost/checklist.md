---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. The kernel: a held mismatch request is called back on the on-file number, locked, compared and saved as a dated record**
  Becomes usable: Open the app, open the flagged mismatch request, see the email with its contacts marked untrusted, start the call-back (trusted number only, email hidden), type the supplier's answers, press Compare and see "…4471 vs …9020" with the payment still held, press Save attempt and see a dated record. The record and the "On hold—details do not match" status survive a reload. The styling is plain for now.
  Why now: This is `scope.md > The Unique Kernel` end to end: the on-file-number lock, the spoken-vs-written comparison and the dated record. Everything else decorates or hardens it, so it comes first, and bad news about the stack (React 19, Vite 8, Vitest 5, Playwright on installed Chrome) arrives now. Bootstrapping is folded in. The scaffold files already exist (written by hand, no scaffolding CLI) and the dependencies are installed.
  PRD ref: `prd.md > The Core Journey` (steps 1–8, mismatch path), `prd.md > Request review and untrusted contacts`, `prd.md > Trusted call-back`, `prd.md > Comparison rules`, `prd.md > Outcomes and payment status` (mismatch)
  Spec ref: `spec.md > Kernel` (Why each rule exists; Normalising and comparing; Attempts and status rules; Records and masking; Time and money formats; Untrusted contacts in the email), `spec.md > Sample data`, `spec.md > Store`, `spec.md > App state hook`, `spec.md > Router`, `spec.md > Call-back step screen`, `spec.md > Comparison screen`, `spec.md > Data Model`, `spec.md > File Structure`, `spec.md > Where It Runs and How Someone Tries It`
  Build: Write these files (the scaffold `package.json`, `tsconfig.json`, `vite.config.ts` and `index.html` already exist; never run a scaffolding CLI):
  - `src/main.tsx` and `App.tsx`;
  - `src/kernel/` `types.ts`, `normalize.ts`, `compare.ts`, `attempts.ts` (`phaseOf`, the lifecycle table, `KernelResult`, `lockAndCompare`, `saveAttempt`), `record.ts`, `format.ts`, `mask.ts` and `untrusted.ts`;
  - `src/data/samples.ts` (5 suppliers, 5 payments, `req-mismatch` and `req-legit`, following the fiction rules);
  - `src/storage/schema.ts` (zod strict) and `store.ts` (one key, whole-state write, read-back, lazy storage access);
  - `src/app/useAppState.ts` ("save first, show second") and `routes.ts` (`resolveRoute` with replace-on-redirect);
  - the five screens, with `EmailView`, `MaskedAccount`, `StatusBadge`, `Icon` and `ErrorBanner` in a minimal style;
  - `src/copy.ts`.

  Unit tests:
  - `normalize.test.ts` (every row in the spec);
  - `compare.test.ts`;
  - `attempts.test.ts` (one `test.each` row per lifecycle cell reached so far);
  - `format.test.ts`;
  - `mask.test.ts`;
  - `untrusted.test.ts`;
  - `store.test.ts` (round trip);
  - `samples.test.ts` (fiction rules, contact scan).

  E2E:
  - `playwright.config.ts` exactly as in the spec;
  - `tests/e2e/helpers.ts` (the automatic network + console fixture, `checkScreen`, fill answers, fixed clock);
  - `tests/e2e/mismatch-journey.spec.ts`, covering RQ-1, RQ-2, CB-1–CB-5, CR-1, CR-3, CR-7, CR-8, OS-2, OS-5 and the VR-6 reload.

  Every test title starts with its Verification Map IDs.
  Verify (mechanical): Run these from PowerShell, one per line, and quote the output tails:
  1. `npm run typecheck` → exit 0.
  2. `npm test` → Vitest reports all passed, 0 failed, 0 skipped.
  3. `npx playwright test tests/e2e/mismatch-journey.spec.ts` → all passed, 0 failed, 0 flaky.

  Then confirm with Grep:
  - `src/screens/CallbackStep.tsx` contains no `requested` and no `email`;
  - `src/` contains no `dangerouslySetInnerHTML` and no `tel:`.
  Learner check: Run `npm run dev` and open `http://localhost:5180`.
  - Open the flagged mismatch request and look at how the email's phone number, reply address and link are marked untrusted.
  - Press Start call-back: you should see only the on-file number and blank fields, and no email.
  - Type the supplier's lines from the README (account ending 4471), press Compare, and check that "…4471 vs …9020" is clear and the payment still says on hold.
  - Save, check that the record is dated, then reload the page and check that the record and status are still there.
  Commit: `Build the call-back kernel: on-file lock, locked comparison, dated record`

- [x] **2. The legitimate request verifies, and the lock holds through Back, reload and the browser's Back button**
  Becomes usable: The second sample can be called back, compared ("Details match.") and saved, after which it shows "Verified" / "Ready to pay" with "Simulated—no money moves.". Until it's saved, it stays exactly "On hold—verification needed". A revealed comparison survives Back and a reload, still locked, and the browser's Back button can never reopen editable answers. A verified request reopens read-only.
  Why now: This completes the scope's "working" definition (one held mismatch and one verified request), and it's where the plan's trickiest promise (locked before revealed, never editable afterwards) gets attacked from every direction while the code is still small.
  PRD ref: `prd.md > Outcomes and payment status`, `prd.md > Comparison rules` (lock, survives Back and reload), `prd.md > Retrying and reopening` (read-only reopening), `prd.md > Trusted call-back` (Back before Compare discards typing)
  Spec ref: `spec.md > Attempts and status rules` (the lifecycle table), `spec.md > Router` (guards, replace-on-redirect, focus/title/scroll), `spec.md > Request detail screen`, `spec.md > Screen contract`, `spec.md > Copy rules`
  Build:
  - Complete the remaining lifecycle cells.
  - `deriveRequestView`, including "Verified", "Ready to pay" and "Simulated—no money moves.".
  - All of `resolveRoute`'s guards, plus `routes.test.ts` (one row per guard, target and replace vs push).
  - The verified read-only Request detail.
  - The Router's focus, title and scroll effect.
  - `tests/e2e/verified-journey.spec.ts` (OS-1, OS-6, RT-3, VR-6) and `tests/e2e/lock-and-persistence.spec.ts` (RQ-3, CB-7, CR-2, CR-9, OS-4), including Enter not comparing and browser Back ×3.
  Verify (mechanical):
  1. `npm run typecheck` → exit 0.
  2. `npm test` → all passed, 0 failed, 0 skipped.
  3. `npx playwright test tests/e2e/verified-journey.spec.ts tests/e2e/lock-and-persistence.spec.ts tests/e2e/mismatch-journey.spec.ts` → all passed, 0 failed, 0 flaky.
  Learner check: With `npm run dev` running:
  - Do the legitimate request: compare, and check the Overview still says on hold before you save. Then save and check it says "Ready to pay" with "Simulated—no money moves.".
  - Start the mismatch request again after a Reset (or use a fresh browser profile), press Compare, then try the browser's Back button and a reload: you should never get editable answers back.
  Commit: `Verify the legitimate request and harden the comparison lock`

- [x] **3. Couldn't verify, retries and a record history that never changes**
  Becomes usable: On the call-back step, "Couldn't verify" saves an attempt with an optional reason (and the person spoken to, if typed). The payment then shows "On hold—verification incomplete" with the reason, and the record shows "Not checked" for every field. An unresolved request lists its earlier attempts and offers "Try verification again" (or "Start a new call-back attempt" from a record), which always starts blank with the email hidden. Earlier records never change, and saved data that breaks the rules is rejected.
  Why now: Retrying is where history can silently be rewritten, so append-only and the invariants arrive together with the first feature that creates more than one attempt.
  PRD ref: `prd.md > Outcomes and payment status` (couldn't verify), `prd.md > Verification records`, `prd.md > Retrying and reopening`
  Spec ref: `spec.md > Attempts and status rules` (`saveCouldntVerify`), `spec.md > Invariants`, `spec.md > Records and masking` (snapshot, `recordResultLabel`), `spec.md > Call-back step screen` (Couldn't verify panel, missing-answers summary), `spec.md > Record view`, `spec.md > Copy rules` (honesty lines)
  Build:
  - `saveCouldntVerify`.
  - `invariants.ts` (`checkInvariants`, `assertAppendOnly`), wired into `store.load` and every kernel unit test, with deep-frozen inputs.
  - The record snapshot fields.
  - `recordResultLabel` (the same-last-four wording).
  - The honesty lines on the call-back step and every record.
  - The Couldn't verify disclosure panel.
  - The missing-answers summary with focus.
  - The Request detail attempt list with reasons.
  - The retry buttons.
  - Unit rows for each.
  - `tests/e2e/couldnt-verify.spec.ts` (CB-6, OS-3 including the double-click → one record, VR-3) and `tests/e2e/retry.spec.ts` (CB-3, CB-4, RT-1, RT-2, RT-4, VR-1).
  Verify (mechanical):
  1. `npm run typecheck` → exit 0.
  2. `npm test` → all passed, 0 failed, 0 skipped. The `invariants` fixtures include the one-digit verified mismatch and the attempt-ID gap.
  3. `npx playwright test tests/e2e/couldnt-verify.spec.ts tests/e2e/retry.spec.ts` → all passed, 0 failed, 0 flaky.
  Learner check:
  - On the mismatch request, use "Couldn't verify" with the reason "No answer", then look at the record: every field should read "Not checked" and the honesty line should be there.
  - Then press "Try verification again", do a full call-back that matches, and open the first record again: it should still say "On hold—details do not match".
  Commit: `Add couldn't-verify, retries and append-only record history`

- [ ] **4. Saved data you can trust: invalid data, blocked storage, failed saves and Reset demo**
  Becomes usable:
  - "Reset demo" asks first. Cancel changes nothing. Confirming restores the two starting requests and clears only Payee Check's data.
  - Corrupted saved data shows the Recovery notice instead of any status.
  - Blocked storage shows the "can't save" notice.
  - Any failed save leaves you on the same screen with your input, "Couldn't save—nothing was changed." and a working Try again, and never shows "Saved", "Verified" or "Ready to pay".
  Why now: The core promises now exist, so this slice proves they hold when the browser misbehaves. It's your "save first, show second" rule tested against real failures, before any visual polish hides problems.
  PRD ref: `prd.md > Reset demo`, `prd.md > States and Boundaries` (persistence)
  Spec ref: `spec.md > Store` (failure codes, `clear()`, lazy access), `spec.md > App state hook` (Try again with a fresh `now`, refusals, `resetDemo`), `spec.md > Important Failure Modes`, `spec.md > Shared pieces` (`ResetDialog`, `ErrorBanner`, `RecoveryNotice`), `spec.md > E2E isolation, determinism and every-screen checks` (seeding, failure injection)
  Build:
  - The Store's failure codes (`unavailable`, `quota`, `readback`) and `clear()`.
  - The hook's Try again (a fresh `now`) and its refusal handling.
  - `RecoveryNotice`.
  - The "can't save" notice.
  - The always-mounted `ErrorBanner` with a keyed message.
  - `ResetDialog` (Cancel focused, Esc = Cancel).
  - The seeds in `helpers.ts` (built by the kernel, via `storageState`).
  - Store unit rows for each failure.
  - `tests/e2e/reset.spec.ts` (RS-1, RS-2 with `other-site:keep`, RS-3).
  - `tests/e2e/storage-failure.spec.ts` (SB-1, SB-2, SB-3 at Compare, Save attempt and Couldn't verify, plus Try again recovering, and SB-5).
  Verify (mechanical):
  1. `npm run typecheck` → exit 0.
  2. `npm test` → all passed, 0 failed, 0 skipped.
  3. `npx playwright test tests/e2e/reset.spec.ts tests/e2e/storage-failure.spec.ts` → all passed, 0 failed, 0 flaky.
  Learner check:
  - Save something, press "Reset demo", Cancel, and check nothing changed. Then confirm and check both requests are back to "On hold—verification needed".
  - Optional: in DevTools › Application › Local Storage, change `payee-check:v1` to `{broken`, reload, and check you see the Recovery notice and no statuses.
  Commit: `Handle invalid data, blocked storage, failed saves and Reset demo`

- [ ] **5. The register look, the printed record and keyboard use**
  Becomes usable: Payee Check looks like a calm payment register and verification form:
  - warm off-white, navy, and green, amber and red with icons and words;
  - monospaced bank numbers;
  - one filled next-action button per screen.

  The record prints as a one-page, black-and-white business form with the account masked. Every screen gets heading focus and a page title, so the whole mismatch journey and a Reset can be done with the keyboard alone.
  Why now: Design is the judges' tie-breaker, but it goes on top of behaviour that's already proven, so restyling can't silently break a rule. The existing E2E suite then re-checks every journey under the new styling.
  PRD ref: `prd.md > Look and Feel`, `prd.md > Overview and payment run`, `prd.md > Verification records` (masking, printing)
  Spec ref: `spec.md > Look and Feel` (Design tokens, Status = colour + icon + words, Density, Avoid, Copy rules, Print, Accessibility basics), `spec.md > Screen contract`, `spec.md > Overview screen`, `spec.md > Shared pieces`
  Build:
  - `styles.css` with the tokens, density, status styles, `.visually-hidden` and `@media print`.
  - The full icon set.
  - The stretched "Review request" row link.
  - Table captions, plus `th` scope for columns and rows.
  - The Screen contract's primary/secondary buttons and `aria-describedby`.
  - `MaskedAccount` (with visually hidden text).
  - `src/look.test.ts` (token contrast, the Avoid-list scan).
  - Extend `checkScreen` (at most one visible primary; every status has an svg and text).
  - `tests/e2e/overview.spec.ts` (OV-1–OV-7, CR-4).
  - `tests/e2e/masking-and-print.spec.ts` (VR-4, VR-5 with the A4 and Letter PDFs at one page each, in `test-results/`).
  - `tests/e2e/keyboard.spec.ts` (LF-2).
  Verify (mechanical):
  1. `npm run typecheck` → exit 0.
  2. `npm test` → all passed, 0 failed, 0 skipped, including `look.test.ts`.
  3. `npm run e2e` → the whole suite passes: 0 failed, 0 flaky, 0 skipped.
  4. Glob `test-results/**/*.pdf` → 4 PDFs.
  Learner check: Open the app at full width and walk both journeys.
  - Does it look like a calm register and verification form?
  - Press Print on a record (Background graphics off) and see whether it reads as a one-page business form in black and white.
  - Try Tab and Enter through the mismatch journey.
  Commit: `Apply the register design, print layout and keyboard flow`

- [ ] **6. Proof the proofs hold: traceability, static guards, no network, deliberate breaks and the README**
  Becomes usable:
  - `npm run check` proves every Verification Map ID has a test, nothing in `src/` can call out or render HTML, and nothing left the laptop in any journey.
  - A logged deliberate-break pass shows each core rule's test turning red when the rule is removed.
  - The README tells someone what it is, who it's for, how to try it in 60 seconds (with the fictional supplier's lines), how to run the checks, its limits, its provenance and the AI assistance.
  Why now: These checks examine the finished suite, so they only make sense once every slice's tests exist. This is your learning goal in its most literal form: checks that prove the checks.
  PRD ref: `prd.md > What We're Building`, `prd.md > States and Boundaries` (what the app can and can't guarantee), `prd.md > Non-Goals`
  Spec ref: `spec.md > Verification Map` (How the map stays true; Proving the checks can fail), `spec.md > Where It Runs and How Someone Tries It` (Runtime: the two network proofs), `spec.md > File Structure` (README Limits)
  Build:
  - `src/guards.test.ts`: no network APIs or non-`.example` URLs in `src/` or `index.html`, and no HTML sinks.
  - `src/traceability.test.ts`: map ↔ titles, plus the `.only`/`.skip` scan.
  - `tests/e2e/no-network.spec.ts` (SB-4, with a localhost guard).
  - Fill any remaining ID gaps the traceability test reports.
  - `README.md`, per the spec's README notes and Limits.
  - Then run the deliberate-break pass B-1–B-9 by hand. Make each one-line break, run only its ID, confirm it fails, then revert. Log `B-n · break · failing test · first failure line` under `## Revisions` below.
  - Finish with the flake check.
  Verify (mechanical):
  1. `npm run check` → typecheck, Vitest and Playwright all pass, with 0 failed, 0 skipped and 0 flaky.
  2. `npx playwright test --repeat-each=3` → all passed, 0 flaky.
  3. Grep `devpost/checklist.md` for `B-9 ·` → 1 hit.
  4. `git diff --stat` after the break pass shows no changes left in `src/`.
  Learner check:
  - Read the README's "Try it in 60 seconds" section and follow it on a reset demo.
  - Then open `src/traceability.test.ts` and its output, and pick one criterion ID from the spec. Can you find the test that proves it in under a minute?
  Commit: `Add traceability, static guards, no-network proof and README`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 2 (both sample requests work end to end, plain styling): try both journeys and the lock, and say what you'd change before the hardening and design slices
  - 2026-10-26 ~11:00, Ahmed: "I tried both journeys. Nothing to change yet; keep building." No revisions requested.
- [ ] Final kick-the-tires exploration and feedback completed — after slice 6, using the spec's Hands-on review script H-1 to H-6

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [what actually happened; real document/test/code references; unfinished work if interrupted]
Route and stops: [actual paths and symbols; guided stops completed, or reference-only route]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: [live app and editor, explicit static fallback, focused alternative, prior practice, or recap]

## Revisions

- 2026-10-26, slice 1 (internal, no change to what Ahmed approved): `compareDetails` returns `{ results, outcome }` rather than one flat object; `src/kernel/` exports small helpers the spec doesn't name (`localYmd`, `lookupRequest`, `savedStatusFor`, `comparisonLine`); `saveAttempt` also refuses `unknown_request` when an attempt's request isn't in the samples; `Icon` carries `data-testid="icon-<name>"`, so CR-7 can tell a cross from a check without a CSS-class selector; `comparisonLine` drops the second full stop after a payee name that already ends in "."; `copy.ts` gained `ACCOUNT_ENDING` for `MaskedAccount`'s hidden text. The "Couldn't verify" button is visible from slice 1, and its panel arrives in slice 3 as planned.
- 2026-10-26, slice 3 (internal wording fix in a learner check): slice 3's learner check says the first record "should still say 'On hold—details do not match'" after a couldn't-verify and a matching retry. A record keeps the status that was true when it was saved, so a couldn't-verify record reads "On hold—verification incomplete"; the "still says 'On hold—details do not match'" case is a saved mismatch that is later retried and verified, which `retry.spec.ts` (VR-1) proves. Behaviour is as the PRD and spec describe; only the learner-check wording was off.

