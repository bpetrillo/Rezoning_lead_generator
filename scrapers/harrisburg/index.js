/**
 * Town of Harrisburg, NC — Development Projects scraper. Cabarrus County.
 *
 * Verified live on 2026-08-26: Harrisburg publishes its projects through a public
 * ArcGIS FeatureServer (services7.arcgis.com/tW1wibhalOW3iStx/.../Development_Projects_view),
 * powering the "Harrisburg Development Map" ArcGIS StoryMap
 * (https://storymaps.arcgis.com/stories/b0cc20e6a1cb44d2919b808c3e1d6cf5) — same general
 * pattern as Huntersville's GIS layer in Mecklenburg County: no bot protection, real
 * polygon geometry (centroid computed here for coordinates, no separate geocoding
 * needed), confirmed via direct query (52 real records, 5 real status values spanning
 * the full lifecycle: Administrative Review, P&Z Board/BOA, Town Council, Approved
 * Plans, Under Construction).
 *
 * Fields available: Name, Development_Status, Notes (a real prose description — often
 * includes acreage and project type hints, e.g. "A 68-lot Age Restricted Single-Family
 * Subdivision on 30 acres..."), Links (an internal SharePoint document link — NOT
 * public, so NOT used as source_url; the public StoryMap page is used instead, shared
 * across all records since there's no individual per-project public page).
 *
 * Notably: this layer covers ALL development activity (subdivisions, site plans, etc.),
 * not specifically "rezonings" — there's no way to filter to just zoning cases the way
 * every other town in this project does, since Harrisburg's public map doesn't
 * distinguish that. Included as-is (broader "development activity" scope), same
 * approach already used for Huntersville and Cornelius.
 */

import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'

const FEATURE_SERVER_URL =
  'https://services7.arcgis.com/tW1wibhalOW3iStx/arcgis/rest/services/Development_Projects_view/FeatureServer/0/query'
const STORYMAP_URL = 'https://storymaps.arcgis.com/stories/b0cc20e6a1cb44d2919b808c3e1d6cf5'

/** Converts Web Mercator (EPSG:3857) coordinates to WGS84 lng/lat — confirmed live
 * against a real Harrisburg polygon, resolves correctly to the Harrisburg, NC area. */
function webMercatorToLngLat(x, y) {
  const lng = (x / 20037508.34) * 180
  let lat = (y / 20037508.34) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return { lng, lat }
}

/** Computes a simple centroid (average of ring vertices) for a polygon feature — same
 * approach used for Huntersville's GIS layer. Uses only the first ring; good enough for
 * a representative point on typical development-site polygons. */
function computeCentroid(geometry) {
  if (!geometry?.rings?.[0]?.length) return null
  const ring = geometry.rings[0]
  const sum = ring.reduce((acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }), { x: 0, y: 0 })
  const avgX = sum.x / ring.length
  const avgY = sum.y / ring.length
  return webMercatorToLngLat(avgX, avgY)
}

/** Pulls "on 30 acres" style text out of the Notes description — same pattern already
 * proven for Concord's descriptions. */
function extractAcreage(notes) {
  if (!notes) return null
  const match = notes.match(/([\d.]+)\s*acres/i)
  return match ? match[1] : null
}

async function fetchProjects() {
  const url = `${FEATURE_SERVER_URL}?where=1=1&outFields=*&f=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Feature query failed: ${res.status}`)
  const data = await res.json()
  return data.features || []
}

async function main() {
  const features = await fetchProjects()
  console.log(`Found ${features.length} Harrisburg development projects.`)

  const records = features.map((feature) => {
    const attrs = feature.attributes
    const centroid = computeCentroid(feature.geometry)

    return {
      name: attrs.Name || `Harrisburg project ${attrs.OBJECTID}`,
      source: 'harrisburg',
      source_id: String(attrs.OBJECTID),
      source_url: STORYMAP_URL, // shared page — no individual per-project public URL exists
      municipality: 'Harrisburg',
      address: null, // not provided by this layer — only a project name + polygon location
      manual_address: null,
      parcel_id: null,
      latitude: centroid?.lat ?? null,
      longitude: centroid?.lng ?? null,
      project_type: classifyProjectType({ description: attrs.Notes }),
      request_type: null, // covers all development activity, not specifically rezonings — see file header
      current_zoning: null,
      zoning: null,
      acreage: extractAcreage(attrs.Notes),
      applicant: null,
      developer: null,
      owner: null,
      owner_mailing_address: null,
      contact_email: null,
      contact_phone: null,
      manual_contact_email: null,
      manual_contact_phone: null,
      status: attrs.Development_Status || null,
      description: attrs.Notes || null,
      last_action_date: attrs.Last_Updated ? new Date(attrs.Last_Updated).toISOString().slice(0, 10) : null,
      hearing_date: null,
    }
  })

  console.log(`Parsed ${records.length} Harrisburg projects.`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
