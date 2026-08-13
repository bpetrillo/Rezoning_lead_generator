/**
 * Town of Davidson — Development Projects scraper.
 *
 * Verified live on 2026-08-13 against:
 *   https://www.townofdavidson.org/106/Development-Projects
 *
 * Terminology quirk (confirmed on the town's own site): Davidson doesn't use the word
 * "rezoning" — because they use a form-based code, what other towns call a rezoning is
 * called a "Map Amendment" here, changing a property's "Planning Area" designation
 * rather than its "zoning." The Text & Map Amendments page only lists *currently
 * pending* amendments (empty as of writing — "There are currently no map amendments
 * under consideration"), so the actual durable list of cases lives on the Development
 * Projects page instead, same sidebar-nav-plus-detail-page pattern as Cornelius.
 *
 * Each project's detail page has a "Site Info" section with <li><strong>Label:</strong>
 * Value</li> pairs — but the exact labels vary page to page (confirmed live across
 * three real pages after the first version of this scraper only matched ~4 of 22
 * correctly): some use "Project Address" (a clean address), others "Project Location"
 * (sometimes a clean address, sometimes prose like "located along the north side of
 * Armour Street..."); "Parcel ID" vs "Parcel IDs" also varies. Both variants are
 * checked for each field now. Prose "addresses" are captured (useful to display even
 * unstructured) but will just fail geocoding gracefully rather than resolving to a
 * real point.
 *
 * No coordinates on the page itself: I checked for an ArcGIS/GeoJSON backend behind the
 * page's "interactive map" (confirmed via network request inspection) and found none —
 * it's a static image, not a live layer like Huntersville's. Geocoding via the US
 * Census Geocoder API (scrapers/lib/geocode.js, free/keyless) is wired in below instead,
 * using whichever address field resolves.
 *
 * No formal case ID/petition number system either (unlike Charlotte's "2026-001" or
 * Huntersville's "R26-01") — Davidson identifies projects by name only, so source_id is
 * a slug derived from the URL path.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import * as cheerio from 'cheerio'

const LIST_URL = 'https://www.townofdavidson.org/106/Development-Projects'
const BASE_URL = 'https://www.townofdavidson.org'

async function fetchProjectList() {
  const res = await fetch(LIST_URL)
  if (!res.ok) throw new Error(`Listing fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const items = []
  const seen = new Set()

  // Scoped to the sidebar project nav (#secondaryNav) — a page-wide `a` selector also
  // matches the site's main nav links (Residents, Town Government, etc.), which happen
  // to follow the same /{id}/{slug} URL pattern. Confirmed via live DOM inspection.
  $('#secondaryNav a').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    // Project detail pages are numeric IDs under the root, e.g. /1567/Clark-Row-...
    if (!href || !/^\/\d+\/[\w-]+$/.test(href)) return
    if (!text || text === 'Recently Completed Development Projects') return
    if (seen.has(href)) return
    seen.add(href)
    items.push({ name: text, url: new URL(href, BASE_URL).toString() })
  })

  return items
}

async function fetchDetail(item) {
  const res = await fetch(item.url)
  if (!res.ok) {
    console.warn(`  detail fetch failed for ${item.name}: ${res.status}`)
    return null
  }
  const html = await res.text()
  const $ = cheerio.load(html)

  const fields = {}
  $('li strong').each((_, el) => {
    // Label text varies slightly across Davidson's pages (trailing colons, sometimes
    // doubled) — strip all trailing colons/whitespace rather than just one.
    const label = $(el).text().replace(/:+\s*$/, '').trim()
    const li = $(el).parent()
    // Grab the li's full text and strip the leading "Label:" part off, since the value
    // is a sibling text node inline with the <strong>, not in its own element.
    const fullText = li.text().replace(/\s+/g, ' ').trim()
    const value = fullText.replace(new RegExp(`^${label}:+\\s*`), '').trim()
    fields[label] = value
  })

  const sourceId = item.url.split('/').filter(Boolean).slice(-2, -1)[0] || item.name

  return {
    name: item.name,
    source: 'davidson',
    source_id: sourceId,
    source_url: item.url,
    municipality: 'Davidson',
    // Confirmed live across multiple pages: "Project Address" (clean address, e.g.
    // Clark Row) and "Project Location" (sometimes a clean address, sometimes prose
    // like "located along the north side of Armour Street...") are both used —
    // inconsistently, page to page. Geocoding will just fail gracefully on the prose
    // ones rather than erroring.
    address: fields['Project Address'] || fields['Project Location'] || null,
    parcel_id: fields['Parcel ID'] || fields['Parcel IDs'] || null,
    latitude: null, // filled in by geocodeRecords() below, when address resolves
    longitude: null,
    project_type: null,
    request_type: null, // Davidson calls these "Map Amendments" not "Rezonings" — not
    // every Development Project is necessarily one, so left null rather than assumed
    zoning: fields['Planning Areas'] || fields['Planning Area'] || null,
    applicant: fields['Applicant'] || null,
    developer: fields['Developer'] || null,
    owner: fields['Property Owner'] || null,
    status: null, // not present as a distinct field on this page
    description: fields['Development Description'] || fields['Project Description'] || null,
    last_action_date: null,
    hearing_date: null,
  }
}

async function main() {
  const items = await fetchProjectList()
  console.log(`Found ${items.length} Davidson development projects.`)
  const records = []
  for (const item of items) {
    const record = await fetchDetail(item)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log(`Parsed ${records.length} Davidson projects.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
