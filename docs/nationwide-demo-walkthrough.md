# Nationwide showcase

Run the default local preview with `npm run dev` (backend disabled). Open `http://localhost:3000/#view=explore&community=sbra` and use the existing demo sign-in if prompted.

## Five-minute walkthrough

1. Explore networks: show the ten fictional organizations, each with its own mark and name. Filter Area to Pacific Northwest to find Cascadia in Seattle, or search a city such as Boston.
2. Open a community: Home has six posts with discussions and reactions. Directory has eight local businesses plus Bridge Studio, the fictional business you represent as Alex Morgan. Opportunities shows eight offers or requests.
3. Open Events, then switch communities. The destination remains Events while the brand, venue, and local gathering change. RSVP to an event, switch away, and return to see the saved response.
4. Open Connections: review sent and received introductions, including open, won, and not-won examples.
5. Choose Try business tools. Networking CRM has six contacts, follow-up tasks, and four opportunities at different stages. Open Pipeline to walk through a deal. Invoice & Quote Generator has draft, sent, and paid examples. Goal & KPI Tracker, Pricing & Margin Calculator, Marketing Content, and Document Templates have editable saved examples.

## What is fictional

Harborlight (Boston), Peachtree (Atlanta), Mercado (Miami), Lakefront (Chicago), Lone Oak (Austin), Front Range (Denver), Desert Bloom (Phoenix), Cascadia (Seattle), Pacific Mosaic (Los Angeles), and Island Bridge (Honolulu) are fictional demonstration organizations. They do not assert real membership, partnerships, transactions, or national adoption. Sample contact addresses use example.com. No sample invoice requires payment.

There are 80 local businesses plus one shared fictional business, 60 posts, 120 comments, 60 referrals, and 30 event listings. The Coast-to-Coast exchange appears in every community; this browser prototype keeps its RSVPs separately per community. Production event sharing remains the separate live-backend workflow.

## Storage and scope

These fixtures are excluded from the production database seed catalog. Each fictional community has separate browser storage for its feed, comments, reactions, events, RSVPs, referrals, support requests, and directory. Existing SBRA and Latino directory data is preserved. The demo actor remains Alex across fictional networks; returning to the original communities restores their existing demo identity.

Tool examples fill missing stores without overwriting existing saved work. CRM adds only the Bridge Studio workspace, retaining existing business workspaces. CRM follows Bridge Studio between demo networks. Other tools retain their existing browser-wide storage behavior. Community reset also clears fictional community collections; it does not reset business tools. Dates are generated relative to the fixture load, then persisted with edits. Event times use the viewer's device timezone.

This is a local usability showcase, not a production deployment or a simulated live backend.

Validation: production build and 65 unit tests passed. Browser checks covered region filtering, community switching, bookmark reload, RSVP persistence, populated CRM pipeline and invoices, and a 390-pixel phone viewport.
