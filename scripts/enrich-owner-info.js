/**
 * Enriches existing projects with real owner name + mailing address, pulled from
 * Mecklenburg County's own public Polaris parcel-record system — a free, unauthenticated
 * government API, not a scrape of any paid third-party product.
 *
 * Verified live on 2026-08-21 against real parcel IDs from three different towns
 * (Davidson, Mint Hill, Matthews) — all resolved correctly, confirming county-wide
 * coverage (Polaris3G covers all of Mecklenburg County, not just Charlotte proper).
 *
 * Matching approach: uses parcel_id, which most (not all) scrapers already capture.
 * Charlotte, Huntersville, and Pineville don't have parcel_id in their scraped data at
 * all, so those projects are skipped here — an address-based lookup would be needed for
 * them instead, which is a different (and only partially reverse-engineered) API flow,
 * not implemented in this pass.
 *
 * Parcel ID format quirk, confirmed live: different towns' own parcel numbering doesn't
 * always match Polaris's internal PID directly — Mint Hill's own site shows
 * "195-182-45", but Polaris needs the dashes stripped ("19518245"). Handled by
 * extractParcelCandidates() below, which also handles multi-parcel fields (e.g.
 * Cornelius: "00706207, 00706219, & 00706216") and stray text fragments (e.g. Matthews:
 * "...and a portion of 215-081-36").
 *
 * Only fills in fields that are currently empty — never overwrites an existing `owner`
 * value (e.g. Davidson's own scraped "Property Owner" field), and writes the mailing
 * address to a dedicated `owner_mailing_address` column that no scraper ever touches.
 */

import { supabaseAdmin } from '../scrapers/lib/upsert.js'
import { extractParcelCandidates, fetchParcelRecord } from '../scrapers/lib/polaris.js'

async function lookupOwner(parcelId) {
  const record = await fetchParcelRecord(parcelId)
  if (!record?.owner?.length) return null
  return {
    ownerName: record.owner.map((o) => o.fullname).join('; '),
    mailingAddress: record.owner[0].mailing_address || null,
  }
}

async function fetchCandidateProjects() {
  // Only projects that have SOME parcel_id and are missing owner_mailing_address —
  // avoids re-querying the county API for rows we've already enriched.
  const { data, error } = await supabaseAdmin
    .from('rezoning_projects')
    .select('id, name, parcel_id, owner, owner_mailing_address')
    .not('parcel_id', 'is', null)
    .is('owner_mailing_address', null)
  if (error) throw error
  return data
}

async function main() {
  const projects = await fetchCandidateProjects()
  console.log(`Found ${projects.length} projects with a parcel_id but no owner info yet.`)

  let enriched = 0
  let skipped = 0

  for (const project of projects) {
    const candidates = extractParcelCandidates(project.parcel_id)
    if (!candidates.length) {
      skipped++
      continue
    }

    let result = null
    for (const pid of candidates) {
      result = await lookupOwner(pid)
      if (result) break
      await new Promise((r) => setTimeout(r, 150))
    }

    if (!result) {
      skipped++
      await new Promise((r) => setTimeout(r, 150))
      continue
    }

    const patch = { owner_mailing_address: result.mailingAddress }
    if (!project.owner) patch.owner = result.ownerName // never overwrite existing owner data

    const { error } = await supabaseAdmin.from('rezoning_projects').update(patch).eq('id', project.id)
    if (error) {
      console.warn(`  failed to save for "${project.name}": ${error.message}`)
      skipped++
    } else {
      enriched++
    }

    await new Promise((r) => setTimeout(r, 150)) // polite delay — this is a live county service
  }

  console.log(`Enriched ${enriched} projects with owner info. Skipped ${skipped} (no parcel match found or no candidates).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
