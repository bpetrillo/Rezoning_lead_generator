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
  Files" page. Has parcel numbers but no address at all, so it can't use the
  address-based geocoding below — geocoding Mint Hill would need a different, parcel-
  based lookup (e.g. Mecklenburg County's GIS), not implemented.
- **Matthews** (`scrapers/matthews/index.js`) — was blocked with 403 Forbidden on plain
  `fetch` requests, even with spoofed browser headers and a simulated session cookie.
  Fixed by switching to Playwright (a real headless Chromium browser), which sidesteps
  whatever fingerprint check was blocking plain requests — confirmed working with real
  data. Runs slower than the others since it drives an actual browser, which is
  expected. Real addresses and parcel IDs; now geocoded (see below).

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
  IDs, real applicant names — now geocoded (see below). Covers development activity
  broadly like Huntersville does; only projects with a "(REZ NN-YY)" petition number in
  the title get tagged as rezonings specifically.

- **Davidson** (`scrapers/davidson/index.js`) — same sidebar-nav + detail-page pattern
  as Cornelius. Real addresses and parcel IDs, now geocoded (see below). Worth knowing:
  Davidson doesn't use the word "rezoning" at all — they call it a "Map Amendment" since
  the town uses a form-based code. Their dedicated pending-amendments page was empty
  when I checked, so this scrapes the durable Development Projects list instead, which
  is where the actual case history lives.

**Full Mecklenburg County coverage achieved** — all 7 municipalities (Charlotte, Mint
Hill, Matthews, Pineville, Huntersville, Cornelius, Davidson) now have a scraper, and
all 7 are confirmed working with real data. Running daily via GitHub Actions.

**Geocoding (`scrapers/lib/geocode.js`)** — uses the free, keyless US Census Geocoder
API. Wired into Matthews, Cornelius, and Davidson, since all three have real street
addresses to geocode from. Verified live against real cases from each town, including
one address-appending fix caught in testing: Matthews and Cornelius addresses are
street-only with no city (e.g. "9520 E Independence Blvd"), which risked matching a
similarly-named street in the wrong NC town — the helper now appends the municipality +
", NC" automatically when it's missing, confirmed correct against a real Matthews
address. Mint Hill still isn't geocoded (see above — no address field to geocode from
at all). Charlotte and Huntersville already had real coordinates from their own sources,
so they don't need this.

## Not included yet

- Geocoding for Mint Hill — needs a parcel-based lookup instead of address-based (see
  above)
- Parcel ID for Charlotte petitions (not on the page — would need the linked site-plan
  PDFs or a cross-reference against county GIS)
- A "suggested/watchlist" view like Boardwalk's
- CSV export / table view
