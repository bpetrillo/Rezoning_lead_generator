/**
 * Backfills coordinates (latitude/longitude) and acreage for projects that have a
 * parcel_id but are missing either field, using the same public Mecklenburg County
 * Polaris system as scripts/enrich-owner-info.js.
 *
 * Biggest beneficiary: Mint Hill, which has parcel numbers but genuinely no address
 * field at all (confirmed when that scraper was originally built), so it's never had
 * coordinates. Polaris returns a real centroid_lat/centroid_lng per parcel — confirmed
 * live against a real Mint Hill parcel (19518245 → 35.1715, -80.6567, correctly in the
 * Mint Hill area).
 *
 * Also backfills acreage for towns whose own scraper never captured it (Matthews'
 * table has no acreage column at all) — Polaris' `land_size` field is usually in
 * square feet, converted here to acres (÷ 43,560).
 *
 * IMPORTANT — tested and confirmed against a real multi-parcel project (Cornelius'
 * Greenway Gartens, 5 parcels): summing Polaris land_size across all parcels gave
 * 21.77 acres, while the town's own site states 25.79 acres for the same project —
 * roughly 15% off, likely GIS-measured land area vs. an official site plan figure.
 * This is a reasonable APPROXIMATION, not an authoritative match. That's exactly why
 * this only ever fills in a BLANK acreage field — it will never overwrite Cornelius'
 * own more-precise value (or any other town's), only fill in towns/projects that have
 * nothing at all.
 *
 * Multi-parcel handling: latitude/longitude use the average centroid across all
 * matched parcels (a reasonable "center of the site" point); acreage sums land_size
 * across all matched parcels. Skips parcels with a land_unit other than "SQUARE FEET"
 * or "ACRES" rather than guessing at an unknown unit's conversion.
 */

import { supabaseAdmin } from '../scrapers/lib/upsert.js'
import { extractParcelCandidates, fetchParcelRecord } from '../scrapers/lib/polaris.js'

const SQFT_PER_ACRE = 43560

function landSizeToAcres(record) {
  if (record.land_size == null) return null
  const unit = (record.land_unit || '').toUpperCase()
  if (unit === 'SQUARE FEET') return record.land_size / SQFT_PER_ACRE
  if (unit === 'ACRES') return record.land_size
  return null // unknown unit — don't guess
}

async function lookupLocationAndAcreage(parcelIds) {
  const points = []
  let totalAcres = 0
  let anyAcreageFound = false

  for (const pid of parcelIds) {
    const record = await fetchParcelRecord(pid)
    await new Promise((r) => setTimeout(r, 150)) // polite delay — live county service
    if (!record) continue

    if (record.centroid_lat != null && record.centroid_lng != null) {
      points.push({ lat: record.centroid_lat, lng: record.centroid_lng })
    }
    const acres = landSizeToAcres(record)
    if (acres != null) {
      totalAcres += acres
      anyAcreageFound = true
    }
  }

  const latitude = points.length ? points.reduce((sum, p) => sum + p.lat, 0) / points.length : null
  const longitude = points.length ? points.reduce((sum, p) => sum + p.lng, 0) / points.length : null

  return {
    latitude,
    longitude,
    acreage: anyAcreageFound ? totalAcres.toFixed(2) : null,
  }
}

async function fetchCandidateProjects() {
  // Projects with a parcel_id where EITHER coordinates or acreage is missing — avoids
  // re-querying the county API for rows that already have everything.
  const { data, error } = await supabaseAdmin
    .from('rezoning_projects')
    .select('id, name, parcel_id, latitude, longitude, acreage')
    .not('parcel_id', 'is', null)
    .or('latitude.is.null,acreage.is.null')
  if (error) throw error
  return data
}

async function main() {
  const projects = await fetchCandidateProjects()
  console.log(`Found ${projects.length} projects with a parcel_id missing coordinates and/or acreage.`)

  let enriched = 0
  let skipped = 0

  for (const project of projects) {
    const candidates = extractParcelCandidates(project.parcel_id)
    if (!candidates.length) {
      skipped++
      continue
    }

    const result = await lookupLocationAndAcreage(candidates)
    const patch = {}
    // Never overwrite existing values — only fill in what's genuinely blank.
    if (project.latitude == null && result.latitude != null) {
      patch.latitude = result.latitude
      patch.longitude = result.longitude
    }
    if (project.acreage == null && result.acreage != null) {
      patch.acreage = result.acreage
    }

    if (Object.keys(patch).length === 0) {
      skipped++
      continue
    }

    const { error } = await supabaseAdmin.from('rezoning_projects').update(patch).eq('id', project.id)
    if (error) {
      console.warn(`  failed to save for "${project.name}": ${error.message}`)
      skipped++
    } else {
      enriched++
    }
  }

  console.log(`Enriched ${enriched} projects with location/acreage info. Skipped ${skipped} (no parcel match found).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
