# Mecklenburg Rezoning Tracker

A free, self-hosted alternative to Boardwalk for tracking rezoning/development
petitions across Mecklenburg County, built on public record data.

## Stack

- **Frontend:** React + Vite + Leaflet, deployed on Vercel
- **Database:** Supabase (Postgres)
- **Data ingestion:** Node scrapers run on a schedule via GitHub Actions

## Setup

1. **Supabase**
   - Create a free project at supabase.com
   - Run `supabase/schema.sql` in the SQL editor
   - Copy your project URL, anon key, and service role key

2. **Frontend**
   ```bash
   npm install
   cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   npm run dev
   ```

3. **Deploy to Vercel**
   - Push this repo to GitHub
   - Import it in Vercel
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables

4. **Scrapers**
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets
     (Settings → Secrets and variables → Actions)
   - The `scrape.yml` workflow runs daily and can also be triggered manually

## Current status (v1 scope: full Mecklenburg County)

Two scrapers are live and working end-to-end with real data in Supabase:

- **Charlotte** (`scrapers/charlotte/index.js`) — pulls the year-by-year petition
  listing and each petition's detail page. Bonus find: Charlotte embeds a Google Maps
  iframe on every petition page with the geocoded lat/long baked into the URL, so real
  coordinates come for free with no separate geocoding step. No parcel ID is shown on
  this page, though.
- **Mint Hill** (`scrapers/mint_hill/index.js`) — parses the FAQ-accordion "Rezoning
  Files" page. Has parcel numbers but no address or coordinates at all — geocoding from
  the parcel is still a TODO here.

One scraper has a fix **attempted but unverified**:

- **Matthews** (`scrapers/matthews/index.js`) — was blocked with 403 Forbidden on plain
  `fetch` requests, even with spoofed browser headers and a simulated session cookie.
  Now uses Playwright (a real headless Chromium browser) instead, which is the standard
  fix for this class of block. This could NOT be tested end-to-end from the dev sandbox
  — it can't download Playwright's browser binary or reach matthewsnc.gov either way, so
  treat this as "best next attempt," not "confirmed working." **Run
  `npm run scrape:matthews` yourself before trusting it** or wiring it into the daily
  GitHub Actions run (a step is prepared as a comment in `scrape.yml`, along with the
  required `npx playwright install --with-deps chromium` step). The table-parsing logic
  itself hasn't changed and was verified against real content earlier.

One scraper is intentionally **thin**:

- **Pineville** (`scrapers/pineville/index.js`) — Pineville doesn't publish structured
  rezoning case data anywhere (checked both their planning bulletin page and their
  Municode-hosted council agendas). This scraper captures project name, category, and
  document links only — no address, parcel, zoning, applicant, or dates, because those
  genuinely don't exist in extractable form without parsing prose text out of PDFs.
- **Huntersville** (`scrapers/huntersville/index.js`) — best coordinate quality of any
  town so far, and unexpectedly: Huntersville doesn't publish rezoning cases as a normal
  web page at all, but through a public ArcGIS FeatureServer backing their interactive
  "Development Projects" map. Real petition numbers, real polygon geometry (coordinates
  computed as a centroid — no geocoding step needed). No address or parcel ID though,
  and the linked detail pages on huntersville.org aren't scraped for more since one
  tested live link 404'd — treating the GIS layer as the sole source of truth here
  avoids building on top of stale links.

- **Cornelius** (`scrapers/cornelius/index.js`) — a status-grouped project list (Under
  Construction / Approved / Proposed) with individual detail pages, each a clean
  label/value table just like Mint Hill's. Real addresses in most cases, real parcel
  IDs, real applicant names. No coordinates anywhere though — geocoding is still a TODO.
  Covers development activity broadly like Huntersville does; only projects with a
  "(REZ NN-YY)" petition number in the title get tagged as rezonings specifically.

- **Davidson** (`scrapers/davidson/index.js`) — same sidebar-nav + detail-page pattern
  as Cornelius. Real addresses and parcel IDs, no coordinates. Worth knowing: Davidson
  doesn't use the word "rezoning" at all — they call it a "Map Amendment" since the town
  uses a form-based code. Their dedicated pending-amendments page was empty when I
  checked, so this scrapes the durable Development Projects list instead, which is where
  the actual case history lives.

**Full Mecklenburg County coverage achieved** — all 7 municipalities (Charlotte, Mint
Hill, Matthews, Pineville, Huntersville, Cornelius, Davidson) now have a scraper.
Matthews has a headless-browser fix attempted but not yet confirmed working (test it
yourself before relying on it) — the other 6 are live and tested against real data.

## Not included yet

- Confirming the Matthews headless-browser fix actually works (untested from the dev
  sandbox — see above)
- Geocoding for Mint Hill and Matthews (and future towns without built-in coordinates)
  — Census Geocoder API is free/keyless and a good candidate, run against the parcel or
  a resolved address
- Parcel ID for Charlotte petitions (not on the page — would need the linked site-plan
  PDFs or a cross-reference against county GIS)
- A "suggested/watchlist" view like Boardwalk's
- CSV export / table view
- The remaining 4 towns
