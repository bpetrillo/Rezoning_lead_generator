/**
 * Town of Huntersville — Rezoning cases via their public ArcGIS FeatureServer.
 *
 * Verified live on 2026-08-13. Huntersville's "Development Projects" map
 * (huntersville.org's "Development Projects" link, an ArcGIS Experience Builder app)
 * is backed by a public, unauthenticated FeatureServer:
 *
 *   https://services7.arcgis.com/CADYoH7VVBN3BQHU/arcgis/rest/services/Development_Projects/FeatureServer/0
 *
 * This is a single polygon layer covering ALL development activity (site plans,
 * subdivisions, variances, etc.), not just rezonings — confirmed live distinct values
 * of the Pln_Typ field: "Commercial Site Plan", "Residential", "Commercial", "Rezoning",
 * "Subdivision", "Variance", "Sign Program", "Density Averaging Certificate" (plus one
 * typo'd duplicate "Commercil Site Plan" in the source data itself — not my typo). We
 * filter server-side to Pln_Typ='Rezoning' (38 of 147 total features as of writing).
 *
 * Fields available per feature: Name (contains the petition number and project name,
 * e.g. "Rezoning R26-01: 23XI Race Shop"), Status_1, Add_Info (an HTML link to a detail
 * page on huntersville.org), and polygon geometry.
 *
 * Real coordinates for free: unlike Mint Hill/Matthews/Pineville, we don't need a
 * separate geocoding step — the polygon geometry lets us compute a centroid directly.
 * This is an approximation (average of the boundary ring's points, not a true
 * area-weighted centroid), fine for map-pin purposes on parcels this size.
 *
 * Detail pages are NOT scraped for additional fields (address, applicant, zoning codes)
 * because they're unreliable — I tested one live link from the data and it 404'd. The
 * town's own linked URLs go stale over time; treating the GIS layer as the only source
 * of truth here avoids building on top of broken links.
 *
 * No parcel ID and no address are available from this source either way.
 */

import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'

const QUERY_URL =
  "https://services7.arcgis.com/CADYoH7VVBN3BQHU/arcgis/rest/services/Development_Projects/FeatureServer/0/query" +
  "?where=Pln_Typ='Rezoning'&outFields=Name,Status_1,Add_Info,FID&returnGeometry=true&f=json&resultRecordCount=500"

/** Average of a polygon ring's vertices — an approximate centroid, good enough for a map pin. */
function ringCentroid(rings) {
  const ring = rings?.[0]
  if (!ring || !ring.length) return { latitude: null, longitude: null }
  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of ring) {
    sumLng += lng
    sumLat += lat
  }
  return { longitude: sumLng / ring.length, latitude: sumLat / ring.length }
}

/** "Rezoning R26-01: 23XI Race Shop" -> { caseId: "R26-01", name: "23XI Race Shop" } */
function parseName(raw) {
  const match = raw.match(/(R\d{2}-\d+)\s*:?\s*(.*)$/i)
  if (!match) return { caseId: null, name: raw }
  return { caseId: match[1].toUpperCase(), name: match[2].trim() || raw }
}

function extractLink(addInfoHtml) {
  const match = addInfoHtml?.match(/href="([^"]+)"/)
  return match ? match[1] : null
}

async function fetchAndParse() {
  const res = await fetch(QUERY_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  if (data.error) throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`)

  return (data.features || []).map((f) => {
    const { caseId, name } = parseName(f.attributes.Name || '')
    const { latitude, longitude } = ringCentroid(f.geometry?.rings)
    const link = extractLink(f.attributes.Add_Info)

    return {
      name,
      source: 'huntersville',
      source_id: caseId || `fid-${f.attributes.FID}`,
      source_url: link || null,
      municipality: 'Huntersville',
      address: null, // not available from this source
      parcel_id: null, // not available from this source
      latitude,
      longitude,
      // No zoning or description field exists in this GIS layer at all — the project
      // name itself (e.g. "Northbrook Storage", "Long Creek Retail") is the only signal
      // available, so it's used as the keyword-matching input.
      project_type: classifyProjectType({ description: name }),
      request_type: 'Rezoning',
      zoning: null,
      applicant: null,
      developer: null,
      owner: null,
      status: f.attributes.Status_1 || null,
      description: null,
      last_action_date: null,
      hearing_date: null,
    }
  })
}

async function main() {
  const records = await fetchAndParse()
  console.log(`Parsed ${records.length} Huntersville rezoning cases (with real coordinates from GIS geometry).`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
