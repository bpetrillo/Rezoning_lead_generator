# Scrapers

Each municipality gets its own small script that fetches its public data and calls
`upsertProjects()` from `lib/upsert.js`. They all write into the same `rezoning_projects`
table (see `supabase/schema.sql`), so the frontend doesn't care which town a record came
from.

## Status

| Municipality | Script | Status |
|---|---|---|
| Charlotte | `charlotte/index.js` | **Verified live** — real address + lat/long (pulled from an embedded Google Maps iframe). No parcel ID on this page. |
| Mint Hill | `mint_hill/index.js` | **Verified live** — has parcel ID but no address or coordinates — geocoding is still a TODO. |
| Matthews | `matthews/index.js` | **Verified live and confirmed working.** Was blocked by 403 Forbidden on plain `fetch`; fixed by switching to a headless browser (Playwright) instead, which sidesteps whatever fingerprint/cookie check was blocking plain requests. Real addresses and parcel IDs; no coordinates. Runs slower than the other scrapers since it drives an actual browser — this is expected. Wired into the daily GitHub Actions run (`npx playwright install --with-deps chromium` runs first in CI). |
| Pineville | `pineville/index.js` | **Verified live, intentionally thin.** No structured case data exists on Pineville's site at all (checked both the planning bulletin page and Municode meeting agendas). Captures project name, category, and document links only — no address, parcel, zoning, applicant, or dates. See the file's header comment for the full reasoning. |
| Huntersville | `huntersville/index.js` | **Verified live, best coordinate quality of any town so far.** Huntersville publishes rezoning cases through a public ArcGIS FeatureServer (backing their "Development Projects" map), not a regular web page. Real petition numbers (R26-01 style) and real polygon geometry — coordinates are computed as a centroid, no geocoding needed. No address or parcel ID available. Linked detail pages on huntersville.org are NOT scraped for extra fields since they're unreliable (one tested live link 404'd) — see file header. |
| Cornelius | `cornelius/index.js` | **Verified live.** Status-grouped nav (Under Construction/Approved/Proposed, 32 projects) with individual detail pages, each a clean label/value table (Applicant, Request, Acreage, Parcel(s), Location, Zoning). Real addresses in most cases (a few are "unaddressed parcel on [road]" instead). No coordinates anywhere — geocoding TODO. Most but not all projects carry a "(REZ NN-YY)" petition number in the page title; only those get `request_type: 'Rezoning'`, others left null rather than mislabeled. |
| Davidson | `davidson/index.js` | **Verified live.** Sidebar-nav + detail-page pattern like Cornelius (22 projects), clean `<li><strong>Label:</strong> Value</li>` fields. Real addresses and parcel IDs. No coordinates (checked for an ArcGIS backend behind their "interactive map" — it's a static image, not a live layer). Terminology note: Davidson calls these "Map Amendments," not "Rezonings" — their pending-amendments page was empty at time of writing, so this scrapes the durable Development Projects list instead. No formal case ID system, so source_id is a URL-derived slug. |

**All 7 Mecklenburg County municipalities now have a scraper, and all 7 are confirmed working with real data**, running daily via GitHub Actions.

Note: my first pass at the Charlotte scraper (before checking the live site) assumed
Charlotte used the Legistar agenda system, based on general knowledge of what other NC
towns use. That was wrong — Charlotte runs its own dedicated rezoning pages — so that
version was deleted and replaced with this real one. Worth remembering when adding new
towns: verify against the live page before writing the parser, not the other way around.

## Adding a new town

1. Find the town's planning/rezoning page (search "`<town name>` rezoning petitions" or
   check their Planning Department page directly).
2. Check whether they use Legistar (`<town>.legistar.com`) for council agendas — if so,
   copy `legistar/charlotte.js` as a starting point and swap the client name.
3. If they publish a plain HTML list/table of petitions (like the Boardwalk screenshot
   for Mint Hill shows), write a scraper using `cheerio` to parse the page — add it as a
   dependency when needed (`npm install cheerio`).
4. Normalize fields to match the `rezoning_projects` schema. Set `latitude`/`longitude` to
   `null` if you only have an address — geocoding can be added as a second pass using a
   free geocoder (e.g. Census Geocoder API, which is free and has no key requirement) or
   Mecklenburg County's Polaris3G parcel lookup for anything with a parcel ID.
5. Add a step to `.github/workflows/scrape.yml`.

## Running locally

```bash
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
node scrapers/legistar/charlotte.js
```
