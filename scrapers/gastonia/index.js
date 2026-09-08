/**
 * City of Gastonia, NC — Planning Application (rezoning) scraper. Gaston County —
 * first town in this county.
 *
 * Gastonia uses a CityView Portal (devsvcs.gastonianc.gov), a different platform than
 * anything else in this project. The visible search UI (/Planning/Locator) is
 * autocomplete-only and NOT browsable directly — confirmed live, typing and submitting
 * doesn't return a results list in the UI itself. But watching real network traffic
 * revealed the actual backend it calls:
 *
 *   GET /Planning/LocatorResults?searchValue=REZ&category=&appealPeriodStatusesOnly=False&isInspectionSearch=False&pageNumber=N
 *
 * — a real, public, unauthenticated, paginated JSON endpoint. Confirmed live: 47 total
 * "REZ"-matching records across 3 pages (16/17/14), no bot protection, no session
 * required.
 *
 * The response has two distinct parts that do NOT align by array index — confirmed
 * live, item 0 in the HTML list and item 0 in LocationMarkers are different records
 * entirely:
 *   - `View`: an HTML fragment with a <li> per result, containing Project Number,
 *     Project Name (a rich description — often includes acreage and parcel info,
 *     e.g. "Rezone the (+/-) 7.1-acre portion of parcel #316213..."), and Locations
 *     (a real street address). Present for ALL results.
 *   - `LocationMarkers`: a JSON array with real WGS84 coordinates (already lat/lng, no
 *     conversion needed), Status, and ApplicationTypeDescription — but confirmed live,
 *     only a SUBSET of results have a matching marker (presumably records without a
 *     single clearly-identified parcel don't get one). Matched to the HTML list by
 *     ReferenceNumber === Project Number, not by position.
 *
 * For the records without a marker, Status is unavailable (left null — no other
 * source exists) and coordinates fall back to the existing Census geocoder using the
 * Locations address text, same as several other towns in this project.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'

const LOCATOR_PAGE_URL = 'https://devsvcs.gastonianc.gov/Planning/Locator'
const RESULTS_URL = 'https://devsvcs.gastonianc.gov/Planning/LocatorResults'
const STATUS_URL_BASE = 'https://devsvcs.gastonianc.gov/Planning/StatusReference'

/** This backend appears to require server-side session state (an ASP.NET pattern) —
 * confirmed live: calling LocatorResults directly with a fresh plain `fetch` (no prior
 * cookies) returns an HTML error page instead of the expected JSON, while a browser
 * session that had already loaded the search page first works fine. This fetches the
 * search page first purely to establish a session cookie, then reuses that cookie for
 * every subsequent results request — Node's fetch doesn't carry cookies between calls
 * automatically the way a browser does, so this has to be done explicitly. */
async function establishSession() {
  const res = await fetch(LOCATOR_PAGE_URL)
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean)
  if (!setCookie.length) {
    console.warn('  no session cookie received from the search page — results may fail.')
    return ''
  }
  return setCookie.map((c) => c.split(';')[0]).join('; ')
}

async function fetchPage(pageNumber, cookie) {
  const url = `${RESULTS_URL}?searchValue=REZ&category=&appealPeriodStatusesOnly=False&isInspectionSearch=False&pageNumber=${pageNumber}`
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} })
  if (!res.ok) throw new Error(`Page ${pageNumber} fetch failed: ${res.status}`)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('json')) {
    const text = await res.text()
    throw new Error(`Page ${pageNumber} returned non-JSON response (likely a session/error page): ${text.slice(0, 200)}`)
  }
  return res.json()
}

function parseHtmlItems(viewHtml) {
  const items = []
  const liRegex = /<li>([\s\S]*?)<\/li>/g
  let liMatch
  let i = 0
  while ((liMatch = liRegex.exec(viewHtml)) !== null) {
    const itemHtml = liMatch[1]
    const numberMatch = itemHtml.match(new RegExp(`id="applicationNumber${i}"[^>]*>([^<]*)<`))
    const nameMatch = itemHtml.match(new RegExp(`id="applicationName${i}"[^>]*>([^<]*)<`))
    const locationMatch = itemHtml.match(/Locations:[\s\S]*?class="basicText">([^<]*)</)
    if (numberMatch) {
      items.push({
        projectNumber: numberMatch[1].trim(),
        projectName: nameMatch ? nameMatch[1].trim() : null,
        location: locationMatch ? locationMatch[1].trim() : null,
      })
    }
    i++
  }
  return items
}

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d.]+)-acre/i)
  return match ? match[1] : null
}

async function fetchAllPages() {
  const cookie = await establishSession()
  const allItems = []
  const markerByRef = new Map()

  for (let page = 0; page < 20; page++) {
    const data = await fetchPage(page, cookie)
    const items = parseHtmlItems(data.View || '')
    if (items.length === 0) break
    allItems.push(...items)
    for (const marker of data.LocationMarkers || []) {
      markerByRef.set(marker.ReferenceNumber, marker)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return { allItems, markerByRef }
}

async function main() {
  const { allItems, markerByRef } = await fetchAllPages()
  console.log(`Found ${allItems.length} Gastonia planning applications.`)

  const records = allItems.map((item) => {
    const marker = markerByRef.get(item.projectNumber)
    return {
      name: item.projectName || item.projectNumber,
      source: 'gastonia',
      source_id: item.projectNumber,
      source_url: `${STATUS_URL_BASE}?referenceNumber=${item.projectNumber}`,
      municipality: 'Gastonia',
      address: item.location,
      manual_address: null,
      parcel_id: null,
      // Confirmed live: some markers exist but have a null MapPoint (not every marker
      // has real coordinates), so checking marker existence alone isn't enough here.
      latitude: marker?.MapPoint ? marker.MapPoint.Y : null,
      longitude: marker?.MapPoint ? marker.MapPoint.X : null,
      project_type: classifyProjectType({ description: item.projectName }),
      request_type: marker?.ApplicationTypeDescription || 'Rezoning',
      current_zoning: null,
      zoning: null,
      acreage: extractAcreage(item.projectName),
      applicant: null,
      developer: null,
      owner: null,
      owner_mailing_address: null,
      contact_email: null,
      contact_phone: null,
      manual_contact_email: null,
      manual_contact_phone: null,
      status: marker?.Status || null,
      description: item.projectName,
      last_action_date: null,
      hearing_date: null,
    }
  })

  console.log(`Parsed ${records.length} Gastonia records.`)
  console.log(`  ${records.filter((r) => r.latitude).length} already have coordinates from the portal.`)

  const needsGeocoding = records.filter((r) => !r.latitude)
  await geocodeRecords(needsGeocoding)

  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
