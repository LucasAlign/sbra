# Nontechnical user simulation — September 24, 2026

Tested the local Berks County Collab seed demo in a real browser at http://127.0.0.1:3000. Perspectives: first-time visitor, busy member finding a service, referral sender, event attendee, small-business owner using invoices, phone user, cross-community visitor, and volunteer administrator. Desktop and a 390 × 844 phone viewport were sampled. This is a simulated usability session, not interviews with actual users or a complete production audit.

## Findings, in priority order

### 1. High — Support contact panel is visually unreadable

Open Support. Its introductory panel looks empty, with an apparently unlabeled blue button. The DOM contains “How can we help?”, explanatory text, and contact links, but the heading computes to white text on a white panel. A person who needs help cannot read the help choices.

Evidence: `.support-contact-hero` has computed background `rgb(255, 255, 255)` and text `rgb(255, 255, 255)`. `app/member-experience.css:36` overrides glass-panel backgrounds while `app/globals.css:1770` and subsequent rules retain white support text.

Fix: give the panel an explicit contrasting background or dark text; verify every contact button label visually.

### 2. High — Admin can save a negative event capacity

Admin tools → Event operations → Breakfast Referral Club → Edit → Capacity = -1 → Save event. The attendance table displays -1 as the saved capacity. The event had two people marked going during the test.

Fix: enforce a positive whole number at save time and explain what happens when reducing capacity below existing attendance. The input's minimum alone does not prevent the current save action. Relevant implementation: `components/admin-view.tsx:673` and `:1713`.

The capacity was restored to 30 and verified.

### 3. Medium — A lead can be sent without any prospect details, then cannot be corrected

Directory → search “plumber” → Service 360 Group → Give a referral. Leave contact name and email/phone blank, enter only “QA simulation: needs a plumbing quote.”, then send. The saved card shows “Prospect—” and no edit or correction action.

This may be intentional for an informal introduction, but it leaves the recipient without an actionable contact and the sender without recovery if they forgot details.

Fix: require a contact method or explicitly allow “Ask me for the contact”; provide edit/follow-up functionality and clear submission feedback. Relevant form: `components/sbra-app.tsx:5602`.

### 4. Medium — Empty invoices can be marked Sent

Tools → Invoice & Quote Generator → New invoice → Sent. Without a client, description, or amount, it appears in the list as Invoice 1001, Sent, $0. Clicking Sent changes the tracking status; it does not establish delivery to anyone.

Fix: require meaningful invoice details before advancing status, and label the action “Mark as sent” so users do not mistake it for emailing an invoice. Make automatic draft saving explicit.

### 5. Medium — Propose an event takes an unnecessarily indirect route

Events → Propose an event opens the Support Center at its top. The prefilled request form is below a resource catalog containing 34 links, instead of being brought into view. The opening panel is also affected by finding 1.

Fix: open a short event proposal form directly, or scroll and focus the prefilled support request with an explanation of what happens next.

### 6. Medium — Refresh loses your place

Navigate to Support Center and refresh. After the loading screen, the signed-in member returns to Community Home. The tested sections remain at the same root URL, so users also cannot copy a useful section-specific address from the address bar.

Fix: represent main screens in routes or URL state, preserving location across refresh and enabling useful bookmarks. `components/sbra-app.tsx:538` initializes the active screen to community.

### 7. Medium — Directory content damages confidence

Directory cards include FXV Digital Design described with “At First Financial Group…” financial-planning copy, Golden Rule Remodeling described with wealth/protection language, and Good Life Companies described only as “Disclosure Info.” These are visible content mismatches, not proof of the upstream cause.

Category choices also mix broad categories, highly specific service descriptions, overlapping marketing categories, and spelling mistakes such as “Comertial Janitorial Services.”

Fix: audit imported descriptions and normalize broad categories while retaining detailed services separately.

### 8. Low/medium — Comment count promises more than the thread shows

On Home, choose “View all 7 comments” on Don Carrick's post. It expands to only two comments, with no further pagination/load-more control in the expanded thread.

Fix: derive the displayed count from available comments or label illustrative activity accurately. The current count combines a seed count with stored comment records in `components/sbra-app.tsx:2422`.

### 9. Low — Entry and input clarity need tightening

- At the default approximately 1265 × 712 browser size, the login screen spends the first screen on a large logo and introduction; the sign-in action is below the fold. Move entry actions higher for returning users.
- In the phone invoice editor, quantity has no visible label, and rate relies on a placeholder. Both appear as unnamed numeric controls in the accessibility tree. Add persistent labels and accessible names.
- Switching to Cámara Latina changes the interface to Spanish and removes member tools, with a helpful explanation and return button. An independent language choice would help English-speaking visitors browsing that community.

## What worked in the sampled flows

- Searching “plumber” finds Service 360 Group even though its category uses “Plumbing.”
- Opening a business and choosing Give a referral correctly preselects its member.
- RSVP changes update counts and persist across refresh/sign-out; the original Going RSVP was restored.
- Empty required fields disable onboarding progression. A valid test email allowed progression to the business step; onboarding was canceled before account creation.
- The phone layout stacks the invoice editor and retains bottom navigation without obvious horizontal overflow in the sampled screen.
- The Cámara Latina directory explains the limited community access and provides a direct return to SBRA.

## Scope and remaining test data

No source implementation changes were made. No live email, production login, external registration, payment, or backend delivery was tested. A malformed-email attempt and an end-before-start date attempt did not reliably retain the intended value through the browser input tooling, so neither is classified as a product validation finding.

The local browser demo retains one QA referral and invoice 1001 (marked Sent, $0, with “QA test item” added afterward). Existing event capacity and member RSVP were restored. The temporary phone viewport was reset. Test data was left for inspection rather than resetting the entire demo and risking unrelated local edits.

Recommended order: repair Support visibility and event validation first; then improve referral/invoice safeguards and event proposal navigation; then fix content consistency, refresh behavior, and labels.
