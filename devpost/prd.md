---
doc: prd
status: approved
---

# Payee Check — Product Requirements

Payee Check helps owners and bookkeepers at small trades and construction firms in Waterloo Region verify a supplier's "our bank details changed" email. It holds the payment, guides a call-back to the number already on file, and locks what the supplier states before comparing it with what the email requested. It saves a dated, printable record of every attempt.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. Someone opens the app and lands on the **Overview**. A line at the top says who it's for. The supplier book and this week's payment run are already filled with fictional sample data, and there's no account or sign-in.
2. Two payment rows are flagged because a bank-change request needs attention. Their payments show **"On hold—verification needed."**
3. They open a flagged row. The **Request detail** screen opens in the same tab and shows:
   - the original sample email, with its contact details marked untrusted;
   - the existing on-file bank details beside the requested ones;
   - the hold status.
4. They press the button that starts the call-back. The **Call-back step** shows:
   - the supplier's identity;
   - the trusted on-file phone number;
   - a short call script;
   - blank answer fields.

   The email and its requested details are hidden.
5. They phone the supplier themselves (the app never places a call) and type what the supplier states:
   - payee name;
   - institution number;
   - transit number;
   - full account number;
   - the name of the person they spoke to.

   They can fix typing freely up to this point.
6. They press **Compare**. Compare needs every required answer. Pressing it **locks that attempt's answers**: from then on, nothing on that attempt can be edited.
7. The **Comparison** appears, with the email's requested details beside the supplier's stated details and a result for each field.
   - **Match:** "Details match." The payment stays on hold until the attempt is saved.
   - **Mismatch:** the differing fields are highlighted, for example an account ending …4471 stated against …9020 requested.
8. They press **Save attempt**. That creates a dated **Verification record** they can view and print.
   - **A match** becomes **Verified**, and the payment becomes **Ready to pay**.
   - **A mismatch** stays **"On hold—details do not match,"** and **Start a new call-back attempt** becomes available.
9. If nobody answers or the supplier can't confirm, they choose **Couldn't verify** on the Call-back step instead of comparing. They record a short reason and save. The payment stays **"On hold—verification incomplete."**
10. Back on the Overview, the row shows its new status. A reload keeps everything, including a revealed comparison that hasn't been saved yet.

Success is when both sample requests run end to end. The mismatch stays held with a saved, printable mismatch record. The legitimate request verifies with a saved, printable verified record. Both survive a reload.

## Screens and Layout

### Overview
One screen holding:
- a short line saying who the app is for;
- the fictional-data label;
- the supplier book;
- this week's payment run;
- a **Reset demo** action.

Each payment-run row shows the supplier name, payment amount, due date, payment status, and whether a bank-change request needs attention. Flagged rows open their Request detail. Rows without a request show a neutral status and look clearly non-interactive.

Supplier-book entries show the supplier name, the trusted on-file phone and the on-file bank details. Account numbers are masked to the last four digits everywhere on this screen.

### Request detail
Opens in the same tab from a flagged row. What it shows depends on the request's state:
- **Unresolved:**
  - the original sample email, with untrusted contact details marked;
  - the existing details beside the requested ones (full fictional values);
  - the current hold status or reason;
  - previous saved attempts;
  - the action to start or retry the call-back (**Try verification again** once an attempt exists).
- **Comparison revealed but not saved:** reopens straight to that locked comparison, with **Save attempt**.
- **Verified:** read-only, as described under `Retrying and reopening`.

Back returns to the Overview without losing saved attempts or a locked comparison.

### Call-back step
Shows:
- the supplier's identity;
- the trusted on-file number;
- the call script;
- blank answer fields;
- **Compare**;
- a separate **Couldn't verify** action.

The email and its requested details are not visible. Back before Compare discards unsaved typing.

### Comparison
Shows the email's requested details and the supplier's locked stated details side by side, in full, with a result for each field and the overall outcome. There's one action, **Save attempt**: no editing, and no "correct and compare again".

### Verification record
A view of one saved attempt, laid out as a clean business form and printable. The same view is used for verified, mismatch and couldn't-verify records. After a mismatch or couldn't-verify attempt is saved, it offers **Start a new call-back attempt**.

## Look and Feel
- **Feel:** "a carefully designed payment register and verification form: calm, practical and trustworthy."
- **Colour:** a warm off-white background, white working surfaces, dark navy text and subtle borders.
  - Green means verified, amber means held or incomplete, and red highlights mismatches.
  - Colour never stands alone. Every status also has words and an icon.
- **Type:** Segoe UI or another readable system font. Bank-number fields use a monospaced font, so digits and leading zeros are easy to inspect.
- **Density:** compact but comfortably spaced tables with clear headings, and one obvious next action per screen.
- **Avoid:** purple gradients, emoji cards, oversized dashboard tiles, decorative charts and distracting animation.
- **Print:** the record looks like a clean business form and stays readable in black and white.

## Features and Behavior

### Overview and payment run
Source: `scope.md > The POC Boundary`.
- As an owner or bookkeeper, I want to see this week's payments and which ones have a bank-change request, so I know what needs attention before paying.
  - [ ] The first screen shows who the app is for, the fictional suppliers and the payment run, with no sign-in step.
  - [ ] Each payment row shows supplier name, amount, due date, payment status and the request-needs-attention indicator.
  - [ ] Exactly two rows start flagged, each with payment status "On hold—verification needed."
  - [ ] Rows without a request show a neutral status, look clearly non-interactive and don't open anything.
  - [ ] Supplier-book entries show name, trusted on-file phone and on-file bank details.
  - [ ] Account numbers on the Overview show only the last four digits.
  - [ ] The label "Fictional sample data—no real call or payment" is visible, along with an honest note that no AI model is used and the rules run in code.

### Request review and untrusted contacts
Source: `scope.md > The Unique Kernel`.
- As a bookkeeper, I want to see the email's claim beside what's on file, so I can see exactly what is being changed.
  - [ ] The Request detail screen shows the original sample email, existing vs requested details in full, and the current hold status.
  - [ ] Every phone number, email address and link that came from the email is visibly marked untrusted, isn't a clickable link, and is never offered as the number to call.
  - [ ] Back returns to the Overview, and all saved attempts, locked comparisons and statuses are unchanged.

### Trusted call-back
Source: `scope.md > The Unique Kernel`.
- As a bookkeeper, I want the app to steer me to the number already on file and to collect the supplier's own statement, so the check rests on the trusted number and what the supplier says, not on the email.
  - [ ] The only phone number on the Call-back step is the supplier's trusted on-file number.
  - [ ] The script reads: "We received a request to change your payment details. Please state the account-holder name and the institution, transit and account numbers we should use."
  - [ ] Answer fields start blank and are never prefilled: account-holder/payee name, institution number, transit/branch number, full account number, and name of person spoken to.
  - [ ] The email and its requested details are not visible anywhere on the Call-back step.
  - [ ] Nothing in the app starts a phone call.
  - [ ] A separate "Couldn't verify" action is always available on this step, and doesn't require the person-spoken-to field.
  - [ ] Back before Compare discards unsaved typing. The next visit starts blank, and earlier saved attempts are unchanged.

### Comparison rules
Source: `scope.md > The Unique Kernel`.
- As a bookkeeper, I want the supplier's statement locked and then compared exactly with the email's request, so I don't miss a changed digit and can't adjust the answer after seeing the claim.
  - [ ] Compare is blocked until all four details and the person spoken to are filled in, and it says which are missing. A missing required answer can never produce "verified".
  - [ ] Pressing Compare locks that attempt's answers. After the comparison appears, no field can be edited, and there's no "correct and compare again".
  - [ ] All four details are compared in full. The account number is compared on every digit, not just the last four.
  - [ ] Leading zeros count: an institution number "004" is not the same as "4".
  - [ ] Harmless spacing in numbers doesn't cause a mismatch: "1234 567" matches "1234567".
  - [ ] Payee names match when they're the same apart from letter case and extra whitespace. There's no abbreviation expansion or fuzzy matching, so "Ltd" vs "Limited" shows as a mismatch.
  - [ ] Each field shows its own result. Any field that differs is highlighted in red with words and an icon. The demo mismatch shows the account ending …4471 stated against …9020 requested.
  - [ ] Masking is display only. The comparison always uses the complete values.
  - [ ] A revealed comparison that hasn't been saved survives Back and a reload with its answers still locked.

### Outcomes and payment status
Source: `scope.md > What "Working" Looks Like`.
- As an owner, I want the payment to stay held until a check is properly completed and saved, so nothing gets paid by accident.
  - [ ] **Match:** the screen shows "Details match." The payment stays on hold until Save attempt. After saving, the request shows "Verified" and the payment "Ready to pay".
  - [ ] **Mismatch:** the payment stays "On hold—details do not match." The user saves the attempt and can then print the record and start a new call-back attempt.
  - [ ] **Couldn't verify:** the user can record a short reason, such as "No answer" or "Supplier couldn't confirm". The payment stays "On hold—verification incomplete," and they can save the attempt and retry later.
  - [ ] A new attempt can't start while a revealed comparison is unsaved. The existing result must be saved first.
  - [ ] Saving, printing, Back or a reload never clears an unresolved hold.
  - [ ] "Ready to pay" is a simulated status, and the app says no money moves.

### Verification records
Source: `scope.md > The POC Boundary`.
- As an owner, I want a dated record of every attempt, so I can show what was done and when.
  - [ ] Every saved attempt creates its own record. Saving a new attempt never replaces or changes an earlier one.
  - [ ] Each record shows:
    - a unique record ID;
    - the date and time with timezone;
    - the supplier name, plus the payment reference, amount and due date;
    - which sample email was checked;
    - the trusted number used;
    - the person spoken to, when a call was completed (as the user entered it);
    - the requested and stated details with a result for each field;
    - the overall outcome (verified, mismatch or couldn't verify);
    - any reason or note;
    - the resulting simulated payment status;
    - the label "Fictional sample data—no real call or payment".
  - [ ] On a couldn't-verify record, fields that weren't collected show "Not checked", never "Match".
  - [ ] Account numbers on saved and printed records show only the last four digits. Institution and transit numbers show in full.
  - [ ] Printing the record gives a clean form, readable in black and white.
  - [ ] Saved records and statuses are unchanged after a page reload.

### Retrying and reopening
- As a bookkeeper, I want to retry an unresolved request without losing earlier attempts, and to see a finished one without redoing it.
  - [ ] An unresolved request shows its current hold reason, its previous attempts and "Try verification again". After saving a mismatch or couldn't-verify attempt, "Start a new call-back attempt" starts the same kind of fresh attempt.
  - [ ] A new attempt needs fresh supplier confirmation. It starts with blank answer fields, hides the email's requested details again, and never copies the previous answers.
  - [ ] Reopening a verified request shows its saved result and record read-only, with "View/Print record" and "Back". There are no editable answer fields and no call-back step.
  - [ ] All of these states are unchanged after a reload.

### Reset demo
- As someone trying the demo, I want to start over, so I can run the journey again.
  - [ ] "Reset demo" on the Overview asks for confirmation before doing anything.
  - [ ] After confirming, locally saved demo attempts and any unsaved locked comparison are cleared. The original two requests, the fictional suppliers and the starting payment statuses are restored.
  - [ ] Cancelling changes nothing.

## States and Boundaries
- **First use:** the Overview with sample data loaded, two requests "On hold—verification needed", and no saved records.
- **Entering answers:** a Call-back step with blank fields and the email hidden. Typing is editable until Compare, and Back discards it.
- **Compared, not saved:** the answers are locked and the result is shown, and the payment is still held. It survives Back and a reload, and the only way forward is Save attempt.
- **Mismatch (saved):** the payment shows "On hold—details do not match". The attempt is listed, with "Start a new call-back attempt" / "Try verification again".
- **Couldn't verify (saved):** the payment shows "On hold—verification incomplete" with the reason. Uncollected fields show "Not checked". The attempt is listed, with a retry.
- **Verified (saved):** the request shows "Verified" and the payment "Ready to pay". It reopens read-only.
- **Missing answers:** Compare is blocked and names the missing fields. They can never produce "verified".
- **Persistence:** saved attempts, records, statuses and any locked unsaved comparison survive a reload, until Reset demo.
- **What the app can and can't guarantee:** the Request detail already shows the email's numbers, so hiding them later can't guarantee independence or prove that a call happened. The protection is that the app locks the recorded supplier response before comparison and keeps every attempt separately. The user still has to follow the call-back procedure honestly.
- **Boundary:** everything is fictional. No call is placed and no money moves, and the app says so.

## Product Decisions
- **One Overview plus a Request detail screen in the same tab.** Simple navigation with detail underneath.
- **The email is hidden during answer entry.** So the user isn't encouraged to read the claim to the supplier. It's described honestly: it doesn't prove independence.
- **Corrections are allowed only before Compare. Compare locks the attempt.** This closes the "edit to match after seeing the email" hole. A retry needs a new saved attempt with fresh supplier confirmation and blank fields.
- **A revealed comparison is preserved across Back and a reload, and must be saved before a retry.** No result can be quietly discarded.
- **All four bank details are compared in full,** with leading zeros kept and harmless spaces ignored. A last-four check would miss a changed digit.
- **Names are compared ignoring only case and extra whitespace.** No abbreviation expansion or fuzzy matching, so differences stay visible.
- **The person spoken to is required before Compare, but not for Couldn't verify.** It's a user-entered statement on the record.
- **Status changes to Verified / Ready to pay only after the attempt is saved.** No unsaved check releases a payment.
- **Each attempt is its own record and is never replaced.** The history stays honest.
- **"Not checked" on couldn't-verify records.** An uncollected field must never read as a match.
- **Account numbers are masked to the last four in the Overview and on records, and shown in full where the user checks them.** This limits what a printout exposes. The comparison still uses full values.
- **A verified request reopens read-only.** The user doesn't repeat a finished call-back.
- **Rows without requests look clearly non-interactive.**
- **Reset demo is confirmed first.** It clears saved demo attempts.
- **Look:** a payment register and verification form, not a dashboard.
- Carried from scope:
  - fixed, read-only fictional suppliers;
  - structured sample emails and no AI model or key, labelled honestly;
  - the app never places calls;
  - local app plus demo video plus public repository;
  - no accounts.

## What We're Building
- The Overview (who it's for, fictional and no-AI labels, supplier book, payment run, Reset demo).
- Two preloaded sample requests: one mismatch that stays held and one legitimate request that verifies.
- The Request detail with untrusted email contacts marked.
- The Call-back step with the trusted number only, the script, blank fields, Compare and "Couldn't verify".
- Compare-locks-answers, then a full-value comparison with a result for each field.
- Three outcomes with their payment statuses, each changing only on Save attempt.
- A dated, separate record for every attempt, masked on records, with "Not checked" for uncollected fields, printable in black and white.
- Retry with blank fields, read-only reopening, and persistence across a reload, including a locked unsaved comparison.

## Deferred From the POC
- **Live inbox integration.** Preloaded samples prove the procedure without email access.
- **Adding and editing suppliers.** A fixed sample book is enough to show the call-back lock.
- **Accounts and sign-in.** The demo must open instantly. Saved data stays local to the browser.
- **Real calls and real payments.** Both are simulated, and no money or call leaves the app.
- **An AI model to read emails.** The samples already carry structured details, and the rules run in code.
- **A live URL.** A local app, the video and the public repository are enough for this version.

## Possible Later Enhancements
- The two deferred items you named, live inbox integration and adding or editing suppliers. No others have been discussed.

## Non-Goals
- **Moving money or connecting to a bank.** The app only shows simulated statuses.
- **Dialling or recording calls.** The user phones independently.
- **Proving that a call happened.** The app records what the user enters and locks it before comparison.
- **Real supplier or business data.** Fictional samples only.

## Open Questions
None.
