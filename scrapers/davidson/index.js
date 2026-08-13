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
 * Each project's detail page has a clean structure — a "Site Info" section with
 * <li><strong>Label:</strong> Value</li> pairs: Planning Areas, Project Address,
 * Parcel ID, Acres, Development Description. Real addresses and parcel IDs present.
 *
 * No coordinates: I checked for an ArcGIS/GeoJSON backend behind the page's "interactive
 * map" (confirmed via network request inspection) and found none — it's a static image,
 * not a live layer like Huntersville's. Geocoding is a TODO here, same as Mint Hill,
 * Matthews, and Cornelius.
 *
 * No formal case ID/petition number system either (unlike Charlotte's "2026-001" or
 * Huntersville's "R26-01") — Davidson identifies projects by name only, so source_id is
 * a slug derived from the URL path.
 */

import { upsertProjects } from '../lib/upsert.js'
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
    const label = $(el).text().replace(/:$/, '').trim()
    const li = $(el).parent()
    // Grab the li's full text and strip the leading "Label:" part off, since the value
    // is a sibling text node inline with the <strong>, not in its own element.
    const fullText = li.text().replace(/\s+/g, ' ').trim()
    const value = fullText.replace(new RegExp(`^${label}:?\\s*`), '').trim()
    fields[label] = value
  })

  const sourceId = item.url.split('/').filter(Boolean).slice(-2, -1)[0] || item.name

  return {
    name: item.name,
    source: 'davidson',
    source_id: sourceId,
    source_url: item.url,
    municipality: 'Davidson',
    address: fields['Project Address'] || null,
    parcel_id: fields['Parcel ID'] || null,
    latitude: null, // TODO: geocode — no coordinates available, see file header
    longitude: null,
    project_type: null,
    request_type: null, // Davidson calls these "Map Amendments" not "Rezonings" — not
    // every Development Project is necessarily one, so left null rather than assumed
    zoning: fields['Planning Areas'] || null,
    applicant: null, // not present in this section (may appear elsewhere per project)
    developer: null,
    owner: null,
    status: null, // not present as a distinct field on this page
    description: fields['Development Description'] || null,
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
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
