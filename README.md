# Payee Check: a supplier call-back check for "our bank details changed" emails

**When an email says a supplier's bank details changed, Payee Check holds the payment, sends you to the phone number already on file, locks what the supplier tells you before comparing it with what the email asked for, and saves a dated, printable record of every attempt.**

Change-request email → payment on hold → call the on-file number (the email's contacts are marked untrusted) → type what the supplier states → Compare locks it → field-by-field result → dated record → Ready to pay only after a saved, full match.

It's for owners and bookkeepers at small trades and construction firms in Waterloo Region who pay suppliers from a weekly payment run. Everything in it is fictional sample data: no real call is placed and no money moves.

## Try it in 60 seconds

Requirements: Node 22.12 or newer and Google Chrome. In PowerShell, one command per line:

```
npm install
npm run dev
```

Open `http://localhost:5180`. There's no account and no setup: the Overview already shows five fictional suppliers and this week's payment run, with two payments on hold.

**The mismatch (the one that should stay held).** Click **Review request** on the Harbourline Lumber Ltd. row, look at how the email's phone number, reply address and link are marked "untrusted—not used", then press **Start call-back**. You "phone" 519-555-0142 (the number on file), and the supplier says:

| Field | Type this |
|---|---|
| Account-holder/payee name | `Harbourline Lumber Ltd.` |
| Institution number | `952` |
| Transit/branch number | `60415` |
| Full account number | `73414471` |
| Name of person spoken to | `Sam Okafor` |

Press **Compare**: "Full account number does not match: supplier said …4471, email requested …9020." The payment stays on hold. Press **Save attempt** for the dated record, then **Print**.

**The legitimate request (the one that verifies).** Do the same on the Cedarline Electrical Supply Inc. row with `Cedarline Electrical Supply Inc.` · `958` · `40388` · `3307126` · `Priya Natarajan`. You'll see "Details match.", but the payment stays on hold until you press **Save attempt**; only then does it read "Ready to pay" ("Simulated—no money moves.").

**Start over** with **Reset demo** on the Overview (it asks first).

All suppliers, people, numbers and emails are invented: domains use the reserved `.example` and phone numbers the fictional 555-01xx range.

## What it enforces

- **Only the on-file number is offered.** Every phone number, address and link in the email is shown as inert text labelled "untrusted—not used", never as a link.
- **The call-back screen can't see the email.** It's built from a type that holds only the request's ID, the supplier's name and the on-file number, so the requested values can't reach it.
- **Compare locks the answers before the comparison exists.** After Compare there's nothing left to edit, and Back, a reload or the browser's Back button can't reopen the fields. A retry starts blank.
- **Every digit is compared.** Bank numbers stay strings (leading zeros count), only spacing and invisible characters are ignored, and names ignore only case, extra spaces, invisible characters and how an accented letter is encoded. "Ltd" vs "Limited" is a mismatch.
- **Statuses come only from saved attempts.** An unsaved match still reads "On hold—verification needed".
- **Every attempt is its own record, and records never change.** "Couldn't verify" records say "Not checked", never "Match". Accounts are masked to the last four digits on the Overview and on records.

## Run the checks

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Vitest unit tests on the rules, the store and the routes |
| `npm run e2e` | Playwright end-to-end tests in the installed Chrome (one worker, no retries) |
| `npm run check` | all three in order |

On Oct 26, 2026, `npm run check` passed: 470 unit tests in 14 files and 59 end-to-end tests, with none skipped.

Every PRD acceptance criterion in `devpost/prd.md` has an ID, and `devpost/spec.md > Verification Map` names the test that proves it (LF-4, the overall register, rests on the hands-on review instead). Test titles start with their IDs, so `npx vitest run -t "CR-3"` or `npx playwright test -g "CR-3"` runs one criterion.

## What leaves this machine

Nothing. There's no server of ours, no account, no API key and no network call: the page talks only to the local Vite dev server. Saved attempts go to this browser's localStorage under one key, `payee-check:v1`. Every end-to-end test fails if the page requests anything other than localhost or an inline `data:` or `blob:` URL. (Chrome's own background traffic isn't the app's.)

## How AI is used

**No AI model runs in this app.** The sample emails already carry their requested details as structured data, and the rules run in code.

**The app was built with AI assistance.** Ahmed Sohail Butt answered the Devpost Learn Skill Pack's planning interviews and approved the scope, PRD, spec and build checklist in `devpost/`. Claude Code (Anthropic's Claude Opus) wrote the code and the tests from those approved documents, slice by slice, and ran the automated checks. Ahmed tried both journeys hands-on at the first planned checkpoint (after slice 2).

## Why it matters

- Spear phishing cost Canadians a reported **$67.9 M in 2025 (813 reports)**, the #2 fraud type by dollar loss. Canadian Anti-Fraud Centre, "Top frauds of 2025", https://antifraudcentre-centreantifraude.ca/features-vedette/2026/02/top-fraud-2025-fraudes-plus-courantes-eng.htm (retrieved 2026-10-25).
- "Payment redirection frauds commonly target small and medium enterprises … businesses in the construction and contracting industry … are common targets." CAFC, https://antifraudcentre-centreantifraude.ca/news-nouvelles/2026/2026-05-13-eng.htm (retrieved 2026-10-25).
- The procedure this app enforces is the one federal guidance gives: "Confirm banking changes using trusted contact information" (CAFC, same page) and "Never use the contact information provided in emails" (Competition Bureau, *The Little Black Book of Scams*, 2nd ed., https://competition-bureau.canada.ca/en/little-black-book-scams-2nd-edition, retrieved 2026-10-25).
- The Kitchener-Cambridge-Waterloo CMA has 18,633 employer businesses, 1,965 of them in construction. Statistics Canada, table 33-10-1097-01 (December 2025), https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3310109701 (retrieved 2026-10-25).

## Limits

- Records live only in this Chrome profile on this laptop. Clearing site data or Reset deletes them; the printed record is the copy that lasts.
- Masking isn't encryption: the full fictional numbers sit in localStorage as plain text, and whoever uses this browser can edit them.
- Institution numbers avoid well-known assigned ones but weren't checked against the official list.
- The app can't guarantee independence or prove a call happened. The Request detail already shows the email's numbers, so hiding them later is a nudge, not proof. It locks the recorded answer before comparison and keeps every attempt.
- Two tabs open at once both write the same saved data, and the last write wins. Use one tab.
- The app never dials, and it can't stop someone dialling an untrusted number by hand.
- It's a proof of concept: fixed sample suppliers, preloaded emails, no inbox, no supplier editing, no real payments.

## Provenance

The folder was created empty on Oct 25, 2026, and the Devpost Learn Skill Pack (`challengepost/learn-ai-basics`, see `skills-lock.json`) was installed into it with the `skills` CLI. The planning documents in `devpost/` were written with Ahmed on Oct 25–26, and all code was written on Oct 26, 2026 from those documents. Nothing is vendored; the only third-party code is the npm packages pinned in `package.json` (React, zod, Vite and its React plugin, Vitest, Playwright, TypeScript and type definitions).

## License

MIT. See `LICENSE`.
