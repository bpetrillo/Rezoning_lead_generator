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

Two scrapers are built and **verified against the live sites** (not guesses):

- **Charlotte** (`scrapers/charlotte/index.js`) — pulls the year-by-year petition
  listing and each petition's detail page. Bonus find: Charlotte embeds a Google Maps
  iframe on every petition page with the geocoded lat/long baked into the URL, so real
  coordinates come for free with no separate geocoding step. No parcel ID is shown on
  this page, though.
- **Mint Hill** (`scrapers/mint_hill/index.js`) — parses the FAQ-accordion "Rezoning
  Files" page. Has parcel numbers but no address or coordinates at all — geocoding from
  the parcel is still a TODO here.

Remaining towns for full county coverage: Matthews, Pineville, Huntersville, Cornelius,
Davidson — none started yet. See `scrapers/README.md` for the process to add one (and a
note on a wrong assumption I made and corrected for Charlotte, worth reading before
starting the next town).

## Not included yet

- Geocoding for Mint Hill (and future towns without built-in coordinates) — Census
  Geocoder API is free/keyless and a good candidate, run against the parcel or a
  resolved address
- Parcel ID for Charlotte petitions (not on the page — would need the linked site-plan
  PDFs or a cross-reference against county GIS)
- A "suggested/watchlist" view like Boardwalk's
- CSV export / table view
- The remaining 5 towns
