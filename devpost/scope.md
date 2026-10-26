---
doc: scope
status: approved
---

# Payee Check

A supplier call-back app for small trades and construction firms. When an email says a supplier's bank details changed, the app holds the payment and walks the owner or bookkeeper through checking the change by phone on the number already on file. It ends with a dated, printable verification record.

## The Unique Kernel
It **enforces the trusted call-back procedure**:
- The only number shown to call is the supplier's previously stored number.
- Contact details from the change-request email are visibly marked as untrusted and can't be used as shortcuts.
- The user asks the supplier to state the new details independently, without first reading out the email's claim, and records that answer.
- The app compares the answer with the requested change. The payment stays on hold if they differ or verification is incomplete.
- A dated, printable record ties the whole process together.

"Without the trusted-number step, independent comparison, and saved record, the main value would disappear."

## Who It's For
Owners and bookkeepers at small trades and construction firms in Waterloo Region who pay suppliers from a weekly payment run. When a supplier email asks to change bank details, they need to confirm the change is real before money goes to the new account.

## The Core Loop
1. Open the supplier book and this week's payment run.
2. Notice the supplier row with a bank-detail-change request attached and open it. It shows the original email, the details already on file, the requested changes, and **"On hold—verification needed."**
3. Follow the call-back step. The number to call is the one already on file, and the email's contact details are marked untrusted.
4. Phone the supplier, ask them to state the new details, then enter what they said. The app never places the call.
5. The app compares the spoken answer with the email's request. A mismatch is highlighted and the payment stays held. A match completes the verification.
6. Save and print the dated verification record.

This repeats for every bank-detail-change request that arrives.

## Inspiration & Identity
Practical, built for a small business doing a consequential task properly. "Simple navigation with useful detail underneath." It should be a complete workflow that ends in something the person can actually use. The visual direction is decided in `3-prd`.

## Why This Matters to the Learner
"The appeal for me is making something practical that helps a small business handle a consequential task properly."

## What "Working" Looks Like
In a one-minute demo, someone opens the sample payment run, notices a supplier's bank-change request and opens it. The payment is on hold. They follow the call-back step using the number already on file and enter the fictional supplier's answer.

**The "oh, that's cool" beat:** "supplier said …4471; email requested …9020," with the mismatch highlighted and the payment still held. Then they save and print the verification record.

A second, legitimate sample shows matching details and a completed verification status. Records are dated, printable and survive a page reload. Calls and payment statuses are simulated throughout.

## The POC Boundary
- The first screen makes clear who the app is for, shows fictional sample suppliers, and lets someone try the demo immediately with no account.
- A fixed, read-only supplier book of fictional suppliers, and a weekly payment run with simulated payment statuses.
- Preloaded sample change-request emails attached to supplier rows. The requested bank details come as structured sample data:
  - one where the supplier's answer doesn't match the email (it stays held);
  - one legitimate request where it matches (it verifies).
- The comparison and verification rules run in code. No AI model or API key in this version, and the app says so honestly.
- The hold, the trusted-number-only call-back step, entry of the supplier's independent answer, the comparison, and the dated, printable record.
- Records survive a page reload.
- Delivered as a local app, a demo video and a public repository.

## Later
- Live inbox integration. For now the emails are preloaded samples.
- Adding and editing suppliers.

## Explicitly Cut
- **Accounts and sign-in.** The demo has to work immediately, with no account.
- **Real banks, payments or payment systems.** Payment statuses are simulated.
- **Real suppliers or business data.** Suppliers are fictional samples only.
- **A live AI model or API key.** The sample emails already carry their requested details as structured data, and the rules run in code.
- **A live URL.** A local app, the demo video and the public repository are enough for this version.
- **Placing calls from the app.** The user phones the on-file number independently, and the call is simulated in the demo.
