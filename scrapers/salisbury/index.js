/**
 * City of Salisbury, NC — Land Use Hearings scraper. Rowan County — first town in
 * this county for this project.
 *
 * Confirmed live: a single page (salisburync.gov/Government/Land-and-Development/
 * Hearings) lists real, currently-scheduled Legislative hearings across 4
 * categories — Rezonings, Future Land Use Map Amendments, Text Amendments,
 * Annexations — each a `<b>CATEGORY</b>` heading followed by a `<ul>` of `<li>`
 * items. Each item is a real case number (a link, wrapped in `<strong>`) followed by
 * free text describing the case — e.g. "RZCD2026-04-00026 1477 Henderson Grove
 * Church Road – Data Storage Facility".
 *
 * Case number PREFIX indicates type: "RZCD"/"RZ" (rezonings — property-specific,
 * usually with a real address), "ANNX" (annexations — property-specific, usually
 * with a real address), "TA" (text amendments — ordinance-wide, never property-
 * specific). All captured here regardless of type, consistent with how this project
 * handles text amendments elsewhere (visible, not filtered out).
 *
 * ADDRESS EXTRACTION: same heuristic already proven for Pineville (a number followed
 * by 1-4 capitalized words, stopping at a sentence/clause boundary) — extended here
 * to also stop at an EN DASH ("–"), confirmed live as the separator this page uses
 * between an address and the project description ("1477 Henderson Grove Church Road
 * – Data Storage Facility").
 *
 * HONEST LIMITATIONS:
 *   - This page only shows currently-scheduled upcoming hearings, not a historical
 *     archive — re-running this scraper regularly is the only way to build up
 *     coverage over time, similar to any single-snapshot agenda-style source.
 *   - No acreage, applicant, or zoning-transition field exists in this format —
 *     only case number, address (when embedded), and a short description.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://salisburync.gov/Government/Land-and-Development/Hearings'

function extractEmbeddedAddress(text) {
  if (/\bP\.?O\.?\s*Box\b/i.test(text)) return null
  const match = text.match(/\b(\d{2,6}\s+[A-Z][a-zA-Z.-]*(?:\s+[A-Z][a-zA-Z.-]*){0,4})(?=[.,(–-]|\s+[–-]|\s+\d|\s+(?:in|for|and)\b|$)/)
  if (!match) return null
  const candidate = match[1].trim()
  if (/^\d+\s+(Townhomes?|Homes?|Units?|Single|Lots?)$/i.test(candidate)) return null
  const leadingNumber = candidate.match(/^\d+/)[0]
  if (leadingNumber.length === 4 && Number(leadingNumber) >= 1900 && Number(leadingNumber) <= 2099) return null
  return candidate
}

function stripMeetingPreamble(text) {
  // Confirmed live: each li includes a "City Council: DATE at TIME VENUE, ADDRESS"
  // preamble before the real case description — stripped so address extraction only
  // sees the actual case text, not the venue's own street address.
  return text.replace(/^(?:City Council|Planning Board):\s*.+?(?:Chambers|Room),?\s*\d+[^,]*?(?:Street|St|Road|Rd|Avenue|Ave)\b\.?\s*/i, '').trim()
}

async function fetchCases() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`)
  const html = await res.text()

  const headingMatches = [...html.matchAll(/<b>(?:<u>)?([^<]+?)(?:<\/u>)?<\/b>/gi)]
    .map((m) => ({ label: decodeHtmlEntities(m[1]).trim(), index: m.index }))
    .filter((h) => /Rezonings|Land Use|Amendments|Annexations/i.test(h.label))

  const cases = []
  for (let i = 0; i < headingMatches.length; i++) {
    const { label, index } = headingMatches[i]
    const sectionEnd = i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length
    const sectionHtml = html.slice(index, sectionEnd)

    const liMatches = [...sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    for (const liMatch of liMatches) {
      const liHtml = liMatch[1]
      const caseNumberMatch = liHtml.match(/<strong>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/strong>/i)
      const caseNumber = caseNumberMatch ? decodeHtmlEntities(caseNumberMatch[1]).trim() : null
      if (!caseNumber) continue

      const fullText = decodeHtmlEntities(liHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
      const rawDescription = fullText.replace(caseNumber, '').trim()
      const description = stripMeetingPreamble(rawDescription)
      const address = extractEmbeddedAddress(description)

      cases.push({ caseNumber, description, address, category: label })
    }
  }
  return cases
}

async function main() {
  const cases = await fetchCases()
  console.log(`Found ${cases.length} Salisbury land use hearing items.`)

  const records = cases.map((c) => ({
    name: c.description || c.caseNumber,
    source: 'salisbury',
    source_id: c.caseNumber,
    source_url: PAGE_URL,
    municipality: 'Salisbury',
    address: c.address,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: c.description }),
    request_type: c.category,
    current_zoning: null,
    zoning: null,
    acreage: null,
    applicant: null,
    developer: null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: 'Scheduled for hearing',
    description: c.description,
    last_action_date: null,
    hearing_date: null,
  }))

  console.log(`Parsed ${records.length} Salisbury records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
