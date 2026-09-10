/**
 * Lincoln County, NC — Pending Zoning Cases scraper.
 *
 * REPLACES an earlier version of this scraper twice over: first pulled 16 pending
 * cases from the Pending Applications webpage table (weak geocoding, 2 of 16
 * resolved), then was narrowed to just ZMA #796's 185 individual parcels (found via
 * that one case's own dedicated ArcGIS Instant App). This version supersedes both —
 * found, by exploring the county's full "Lincoln County Zoning Cases" GIS map
 * viewer (a comprehensive public tool separate from any single case's own map),
 * that EVERY pending case — not just the two bulk ones — has a real parcel polygon
 * in one shared, queryable ArcGIS Feature Service.
 *
 * DISCOVERY: the map viewer is an Esri WebAppBuilder app. Traced its configuration
 * (content/items/{app-id}/data → map.itemId → content/items/{webmap-id}/data →
 * operationalLayers) to find the real service URL:
 *   https://services8.arcgis.com/TaX0xkzgvxdv4n56/arcgis/rest/services/ZoningCaseLog_AllCases_Feb2018/FeatureServer/0
 * This layer holds every zoning case back to 2010 as a real parcel polygon, with a
 * CASESTATUS field — querying `CASESTATUS LIKE '%Pending%'` returns exactly the
 * cases currently pending (confirmed live: 15 features). Since every feature is a
 * real polygon, a centroid computed directly from its geometry gives an exact point
 * for every case — NO GEOCODING NEEDED AT ALL, the same advantage ZMA #796's own
 * feature service had, now extended to every pending case.
 *
 * The CASENAME field turns out to already contain the same full prose description
 * already used for acreage/zoning-transition/location extraction (e.g. "A request to
 * rezone a 3.97-acre portion of a parcel from R-T (Transitional Residential) to B-G
 * (General Business). The property is located at 3623 Maiden Highway in Lincolnton
 * Township.") — confirmed live, byte-for-byte the same text as the Pending
 * Applications webpage's own description column.
 *
 * Confirmed live: some cases span more than one parcel/polygon (e.g. "PD #2026-3"
 * appeared as 2 separate features) — each polygon becomes its own point here, same
 * approach as the ZMA #796 parcel scraper. The existing upsert-time duplicate
 * detection (already relied on elsewhere in this project) safely keeps both as
 * separate rows rather than overwriting one with the other.
 *
 * HONEST LIMITATIONS:
 *   - A polygon centroid is the geometric center of the parcel shape, not
 *     necessarily where a structure sits on it — a reasonable approximation for an
 *     irregularly-shaped rural parcel, not a precise building location.
 *   - CASENAME is missing for a few older/administrative case types (e.g. VAR
 *     variance cases don't always include a rich prose description) — acreage/
 *     zoning-transition/location extraction will come back null for those, same as
 *     any other town's project when a description field is thin.
 */

import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'

const FEATURE_SERVICE_URL =
  'https://services8.arcgis.com/TaX0xkzgvxdv4n56/arcgis/rest/services/ZoningCaseLog_AllCases_Feb2018/FeatureServer/0/query'
const MAP_VIEWER_URL =
  'https://lincolncountync.maps.arcgis.com/apps/webappviewer/index.html?id=2e01b3030fb640fbbef0d431613e9204'

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d,.]+)[\s-]*acres?/i)
  return match ? match[1].replace(/,/g, '') : null
}

function extractZoningTransition(text) {
  if (!text) return { from: null, to: null }
  const match = text.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+for\s+|\.|,)/i)
  return match ? { from: match[1].trim(), to: match[2].trim() } : { from: null, to: null }
}

function extractLocationText(text) {
  if (!text) return null
  const match = text.match(/located\s+(?:at|on|about|near)?\s*(.+?)(?:\.|$)/i)
  return match ? match[1].trim() : null
}

/** Simple vertex-average centroid of a polygon's outer ring — a reasonable
 * approximation for the roughly-convex parcel shapes in this dataset. Confirmed
 * live against a known case (ZMA #790) to land at the correct real-world location. */
function computeCentroid(geometry) {
  if (!geometry?.rings?.[0]?.length) return null
  const ring = geometry.rings[0]
  const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length
  const cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length
  return { longitude: cx, latitude: cy }
}

function formatDate(epochMs) {
  if (!epochMs) return null
  return new Date(epochMs).toISOString().slice(0, 10)
}

async function fetchPendingCases() {
  const params = new URLSearchParams({
    where: "CASESTATUS LIKE '%Pending%'",
    outFields: '*',
    f: 'json',
    returnGeometry: 'true',
    outSR: '4326',
  })
  const res = await fetch(`${FEATURE_SERVICE_URL}?${params}`)
  if (!res.ok) throw new Error(`Feature service query failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data.features)) throw new Error('Unexpected feature service response shape')
  return data.features
}

async function main() {
  const features = await fetchPendingCases()
  console.log(`Found ${features.length} Lincoln County pending zoning case parcels.`)

  const records = features
    .map((f) => {
      const a = f.attributes
      const centroid = computeCentroid(f.geometry)
      const description = a.CASENAME || null
      const acreage = extractAcreage(description)
      const { from, to } = extractZoningTransition(description)
      const location = extractLocationText(description)
      const hearingDate = formatDate(a.HEARINGDT)

      return {
        name: a.APPLICANT || a.CASEID,
        source: 'lincoln_county',
        source_id: String(a.OBJECTID), // unique per polygon — safely distinguishes multi-parcel cases like "PD #2026-3"
        source_url: MAP_VIEWER_URL,
        municipality: 'Lincoln County',
        address: location,
        manual_address: null,
        parcel_id: a.CASEID || null,
        latitude: centroid?.latitude ?? null,
        longitude: centroid?.longitude ?? null,
        project_type: classifyProjectType({ description, zoning: to }),
        request_type: a.CASETYPE || null,
        current_zoning: from,
        zoning: to,
        acreage,
        applicant: a.APPLICANT || null,
        developer: null,
        owner: null,
        owner_mailing_address: null,
        contact_email: null,
        contact_phone: null,
        manual_contact_email: null,
        manual_contact_phone: null,
        status: hearingDate ? `Scheduled for hearing on ${hearingDate}` : 'Pending',
        description,
        last_action_date: hearingDate,
        hearing_date: hearingDate,
      }
    })
    .filter((r) => r.latitude != null)

  console.log(`Parsed ${records.length} Lincoln County records.`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
