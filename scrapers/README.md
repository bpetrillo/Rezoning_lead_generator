# Scrapers

Each municipality gets its own small script that fetches its public data and calls
`upsertProjects()` from `lib/upsert.js`. They all write into the same `rezoning_projects`
table (see `supabase/schema.sql`), so the frontend doesn't care which town a record came
from.

## Status

| Municipality | Script | Status |
|---|---|---|
| Charlotte | `charlotte/index.js` | **Verified live** — built and tested against the real page structure (charlottenc.gov). Has real address + lat/long (pulled from an embedded Google Maps iframe). No parcel ID on this page. |
| Mint Hill | `mint_hill/index.js` | **Verified live** — built and tested against the real page structure (minthill.com). Has parcel ID but no address or coordinates — geocoding is still a TODO. |
| Matthews | — | Not started |
| Pineville | — | Not started |
| Huntersville | — | Not started |
| Cornelius | — | Not started |
| Davidson | — | Not started |

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
