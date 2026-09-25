# Usability fixes — verification

Implemented the recommendations from the nontechnical user simulation in the local seed app.

- Support contact panel: restored contrast; heading and all three contact links are readable in the browser.
- Event capacity: rejects negative, zero, fractional, nonfinite, and below-attendance limits. Browser attempts with -1 and 2 (three attendees) left the saved capacity at 30.
- Referrals: contact name and contact method required for leads; the sender can edit details on an open referral; successful saves have visible feedback. Verified blocked and successful submissions plus editing.
- Invoices: incomplete and zero-value documents cannot be marked sent or paid; status actions explicitly say Mark as; edits that invalidate a document return it to Draft. Verified a valid $100 invoice and a subsequent zero-value edit.
- Event proposals: request form comes before the resource catalog, with direct focus from Events.
- Navigation: main view and community are encoded in the URL; verified refresh, Back, and community restoration.
- Directory: repaired recognized stale imported descriptions without overwriting custom copy; grouped related category filters; replaced the Disclosure Info placeholder.
- Comments: count reflects the available thread; zero/one/many labels are explicit.
- Entry and phone layout: sign-in is above the fold, invoice line fields have persistent labels, and the Latina directory offers a persistent English/Spanish choice independently of access.

Validation: all 60 tests in npm run test:network pass; TypeScript and git diff --check pass. Browser checks used the default desktop viewport and 390 × 844 phone viewport. No browser console errors were recorded. The final production build result is reported in the task response.

Scope: local seed experience; no production deployment or external messages. Verification on port 3015 used a separate local browser store from the earlier simulation. That store retains a QA referral and a QA invoice now in Draft; existing event capacity and RSVPs were unchanged during fix verification. Temporary viewport override was reset.
