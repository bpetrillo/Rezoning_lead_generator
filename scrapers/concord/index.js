/**
 * City of Concord, NC — Zoning Map Amendment scraper. Cabarrus County — the first town
 * scraped OUTSIDE Mecklenburg County, part of expanding coverage to the 60-mile radius
 * around Charlotte.
 *
 * Verified live on 2026-08-25 against real case data:
 *   Listing: https://apps.concordnc.gov/legacy/PlanningWeb/CaseManager/Cases/Cases.html
 *   Detail:  https://apps.concordnc.gov/legacy/PlanningWeb/CaseManager/Cases/Z-22-25/CaseDetails.html
 *
 * No bot protection at all — confirmed via plain fetch (200 responses, correct real
 * content) on both the listing and detail pages. Much simpler than Charlotte or
 * Matthews needed to be.
 *
 * LISTING STRUCTURE: one big HTML table, ALL case types mixed together (Zoning Map
 * Amendment, Special Use Permit, Variance, Site Plan, Annexation, etc.) — confirmed
 * live there are 17 distinct case types in this table. Filtered here to just "Zoning
 * Map Amendment" (192 real cases found, spanning 2018–2026), matching the scope used
 * for every other town in this project. Each case is actually TWO <tr> rows: the main
 * data row (Year, Case Number+link, Case Name, Case Type, Status), followed immediately
 * by a colspan=4 "note" row with the most recent status update, prefixed with a date
 * ("2026-03-12: Approved zoning change to I-2...").
 *
 * DETAIL PAGE: richer than most Mecklenburg towns — a real street address ("Location"),
 * a prose Description that reliably embeds the applicant name ("X has submitted a
 * Zoning Map Amendment application..." — confirmed live on 2 different real cases),
 * acreage ("+/- 142.40 acres"), and the current→proposed zoning transition ("from CR
 * ... and I-1 ... to I-2"). A clean, separate "Parcels" section lists real Parcel IDs
 * (not embedded in prose like several Mecklenburg towns) — the most reliable field on
 * this page. Also has real Meetings/Updates history, which Mecklenburg towns don't
 * expose — only the most recent update is captured here (matching last_action_date),
 * not the full meeting-by-meeting history, to stay consistent with the existing schema.
 *
 * NOT wired into Mecklenburg County's Polaris-based owner/location enrichment scripts
 * (scripts/enrich-owner-info.js, scripts/enrich-location-info.js) — those are
 * Mecklenburg-County-specific and won't have Cabarrus County parcels. Cabarrus County
 * would need its own GIS/tax system researched separately as a future enhancement, not
 * assumed to work here.
 *
 * TLS NOTE (2026-08-25): this legacy server ("apps.concordnc.gov/legacy/...") has an
 * incomplete SSL certificate chain — confirmed live: a real browser connects fine
 * (browsers auto-repair a missing intermediate certificate via AIA fetching), but
 * Node.js's fetch fails with "unable to get local issuer certificate" since Node
 * doesn't do that repair automatically. This is a real, deliberate, narrowly-scoped
 * tradeoff: fetchInsecure() below disables certificate verification, but ONLY for
 * requests to this one legacy government server — every other network call in this
 * project (Supabase, the Census geocoder, every other town's scraper) still uses
 * normal, fully-verified HTTPS. The risk is low (this is a read-only GET against a
 * public informational page — no credentials or user data ever sent to it), but it's a
 * real tradeoff worth knowing about, not a free fix.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import * as cheerio from 'cheerio'
import { Agent, fetch as undiciFetch } from 'undici'

const LISTING_URL = 'https://apps.concordnc.gov/legacy/PlanningWeb/CaseManager/Cases/Cases.html'
const DETAIL_BASE = 'https://apps.concordnc.gov/legacy/PlanningWeb/CaseManager/Cases'

// Scoped ONLY to this scraper's requests — see the TLS NOTE above. Every other fetch
// call anywhere else in this project (including geocodeRecords/upsertProjects called
// later in this same file) is completely unaffected and stays fully verified.
//
// IMPORTANT: uses undici's OWN fetch (not Node's global fetch) paired with its own
// Agent — confirmed via direct testing that mixing Node's built-in fetch with a
// separately-installed undici package's Agent throws an internal version-mismatch
// error ("invalid onRequestStart method"), even though the API looks like it should
// work. Using undici's fetch and Agent together avoids that entirely.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } })
function fetchInsecure(url) {
  return undiciFetch(url, { dispatcher: insecureAgent })
}

async function fetchCaseList() {
  const res = await fetchInsecure(LISTING_URL)
  if (!res.ok) throw new Error(`Listing fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const rows = $('table tr').toArray()
  const cases = []

  for (let i = 0; i < rows.length; i++) {
    const cells = $(rows[i]).find('td')
    if (cells.length < 5) continue // skip header row and note rows

    const caseType = $(cells[3]).text().trim()
    if (caseType !== 'Zoning Map Amendment') continue

    const caseNumber = $(cells[1]).text().trim()
    const link = $(cells[1]).find('a').attr('href')
    if (!link || !caseNumber) continue

    // The next <tr> (if present) is a status-note row: "YYYY-MM-DD: note text"
    let lastActionDate = null
    const nextCells = $(rows[i + 1])?.find('td') ?? []
    if (nextCells.length === 2) {
      const noteText = $(nextCells[1]).text().trim()
      const dateMatch = noteText.match(/^(\d{4}-\d{2}-\d{2}):/)
      if (dateMatch) lastActionDate = dateMatch[1]
    }

    cases.push({
      caseNumber,
      name: $(cells[2]).text().trim(),
      status: $(cells[4]).text().trim(),
      url: link,
      lastActionDate,
    })
  }

  return cases
}

/** Pulls the applicant name out of the description prose — confirmed live on 2 real
 * cases: "[Name] has submitted a Zoning Map Amendment application...". Returns null
 * rather than guessing when the description doesn't follow this exact pattern. */
function extractApplicant(description) {
  if (!description) return null
  const match = description.match(/^(.+?)\s+has submitted/)
  return match ? match[1].trim() : null
}

/** Pulls "+/- 142.40 acres" style text out of the description — confirmed live. */
function extractAcreage(description) {
  if (!description) return null
  const match = description.match(/[+/-]*\s*([\d.]+)\s*acres/i)
  return match ? match[1] : null
}

/** Pulls a "from X to Y" zoning transition out of the description prose — confirmed
 * live on 2 real cases. Best-effort: some descriptions may not follow this exact
 * pattern, in which case both come back null rather than a wrong guess. */
function extractZoningTransition(description) {
  if (!description) return { current: null, proposed: null }
  const match = description.match(/from\s+(.+?)\s+to\s+([A-Z0-9()\- ]+?)\.(?:\s|$)/i)
  if (!match) return { current: null, proposed: null }
  return { current: match[1].trim(), proposed: match[2].trim() }
}

async function fetchCaseDetail(caseInfo) {
  const res = await fetchInsecure(caseInfo.url)
  if (!res.ok) {
    console.warn(`  detail fetch failed for ${caseInfo.caseNumber}: ${res.status}`)
    return null
  }
  const html = await res.text()
  const $ = cheerio.load(html)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()

  const locationMatch = bodyText.match(/Location:\s*(.+?)\s*Description:/)
  const address = locationMatch ? locationMatch[1].trim() : null

  const descriptionMatch = bodyText.match(/Description:\s*(.+?)\s*Status:/)
  const description = descriptionMatch ? descriptionMatch[1].trim() : null

  // Parcels appear in their own clean section — "Parcels Parcel ID 4691-32-7633
  // 4691-41-2998 ..." — confirmed live, much more reliable than parsing prose.
  const parcelsMatch = bodyText.match(/Parcels\s+Parcel ID\s+(.+?)\s+Meetings/)
  const parcelIds = parcelsMatch
    ? parcelsMatch[1].match(/\d{4}-\d{2}-\d{4}/g) || []
    : []

  const zoning = extractZoningTransition(description)

  return {
    name: caseInfo.name,
    source: 'concord',
    source_id: caseInfo.caseNumber,
    source_url: caseInfo.url,
    municipality: 'Concord',
    address,
    manual_address: null,
    parcel_id: parcelIds.join(', ') || null,
    latitude: null, // no coordinates on this page — geocoded below
    longitude: null,
    project_type: classifyProjectType({ description }),
    request_type: 'Rezoning',
    current_zoning: zoning.current,
    zoning: zoning.proposed,
    acreage: extractAcreage(description),
    applicant: extractApplicant(description),
    developer: null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: caseInfo.status,
    description,
    last_action_date: caseInfo.lastActionDate,
    hearing_date: null,
  }
}

async function main() {
  const cases = await fetchCaseList()
  console.log(`Found ${cases.length} Concord Zoning Map Amendment cases.`)

  const records = []
  for (const caseInfo of cases) {
    const record = await fetchCaseDetail(caseInfo)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 150)) // polite delay
  }
  console.log(`Parsed ${records.length} Concord cases.`)

  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})