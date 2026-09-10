/**
 * Town of Pineville, NC — Planning Projects bulletin scraper. Mecklenburg County.
 *
 * REWRITTEN: the original version of this scraper had a real structural bug that
 * produced badly broken data — confirmed live, records like "Miller Farm Traffic
 * Study Miller Farm proposed concept drawing Miller Farm Rezoning plan set Single
 * family elevations Townhome elevations" were actually SEVERAL separate document
 * links for ONE real project ("Miller Farm subdivision") incorrectly treated as
 * multiple separate projects, because the original version extracted every `<a>` tag
 * as its own record instead of respecting paragraph boundaries.
 *
 * CONFIRMED LIVE via direct DOM/HTML inspection: the page (pinevillenc.gov/
 * planningmeetingsprojectsevents) is structured as `<h4>CATEGORY:</h4>` headings
 * (PROPOSED RESIDENTIAL DEVELOPMENT, NEW RESIDENTIAL DEVELOPMENT, NEW COMMERCIAL
 * DEVELOPMENT, ROAD and SIDEWALK PROJECTS, GENERAL INTEREST), each followed by a run
 * of `<p>` tags — and each `<p>` IS one real project, even when it contains multiple
 * `<a>` links to different supporting documents (rezoning plan, traffic study, site
 * elevations, etc.) separated by `<br>` inside the same paragraph. This version
 * correctly treats one `<p>` as one project record.
 *
 * ADDRESS EXTRACTION: many entries genuinely embed a real street address directly in
 * their text (e.g. "9540 Rodney. New Euroline Warehouse...", "Aspen Dental 8336
 * Pineville-Matthews RD"), in inconsistent positions (leading or trailing) with no
 * consistent delimiter — handled with a heuristic regex (a number followed by 1-3
 * capitalized words, stopping at a sentence boundary) rather than a fixed pattern,
 * with a blocklist to reject common false positives like "166 Townhomes" (a unit
 * count, not an address).
 *
 * HONEST LIMITATIONS:
 *   - Address extraction is a genuine heuristic against free-text bulletin prose,
 *     not a structured field — expect real misses and occasional false positives on
 *     entries with unusual phrasing.
 *   - Includes a "GENERAL INTEREST" section that may contain non-project
 *     announcements alongside real projects — same honest tradeoff as including any
 *     other town's administrative agenda items.
 *   - No case/petition number exists in this data — source_id is built from the
 *     project name plus its position, stable as long as the town doesn't reorder
 *     the bulletin.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://www.pinevillenc.gov/planningmeetingsprojectsevents/'

function extractEmbeddedAddress(text) {
  if (/\bP\.?O\.?\s*Box\b/i.test(text)) return null // confirmed live: PO Box numbers aren't street addresses
  const match = text.match(/\b(\d{2,6}\s+[A-Z][a-zA-Z.-]*(?:\s+[A-Z][a-zA-Z.-]*){0,2})(?=[.,(]|\s+\d|\s+(?:in|for|and)\b|$)/)
  if (!match) return null
  const candidate = match[1].trim()
  if (/^\d+\s+(Townhomes?|Homes?|Units?|Single|Lots?)$/i.test(candidate)) return null
  // Confirmed live: "Flood insurance Hazard Mitigation report 2022 Recertification"
  // matched "2022 Recertification" as a fake address — a 4-digit number that looks
  // like a plausible year is almost certainly a year reference, not a street number.
  const leadingNumber = candidate.match(/^\d+/)[0]
  if (leadingNumber.length === 4 && Number(leadingNumber) >= 1900 && Number(leadingNumber) <= 2099) return null
  return candidate
}

function paragraphText(pHtml) {
  const withBreaks = pHtml.replace(/<br\s*\/?>/gi, ' ')
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

function extractProjectName(pHtml, fallbackText) {
  const strongMatch = pHtml.match(/<strong>([\s\S]*?)<\/strong>/i)
  if (strongMatch) return decodeHtmlEntities(strongMatch[1].replace(/<[^>]+>/g, '')).trim()
  const linkMatch = pHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i)
  if (linkMatch) return decodeHtmlEntities(linkMatch[1].replace(/<[^>]+>/g, '')).trim()
  const firstLine = fallbackText.split(/\s{2,}|\n/)[0]
  return firstLine || fallbackText
}

async function fetchProjects() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`)
  const html = await res.text()

  const headingMatches = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)].map((m) => ({
    label: decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).replace(/:$/, '').trim(),
    index: m.index,
    endIndex: m.index + m[0].length,
  }))

  const projects = []
  let projectIndex = 0
  for (let i = 0; i < headingMatches.length; i++) {
    const { label, endIndex } = headingMatches[i]
    if (!label) continue
    const sectionEnd = i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length
    const sectionHtml = html.slice(endIndex, sectionEnd)

    const pMatches = [...sectionHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    for (const pMatch of pMatches) {
      const pHtml = pMatch[1]
      const fullText = paragraphText(pHtml)
      if (!fullText) continue
      const name = extractProjectName(pHtml, fullText)
      if (!name) continue
      const address = extractEmbeddedAddress(fullText)

      projects.push({ name, description: fullText, address, category: label, projectIndex })
      projectIndex++
    }
  }
  return projects
}

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Pineville planning bulletin entries.`)

  const records = projects.map((p) => ({
    name: p.name,
    source: 'pineville',
    source_id: `${p.name}-${p.projectIndex}`,
    source_url: PAGE_URL,
    municipality: 'Pineville',
    address: p.address,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: p.description }),
    request_type: null,
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
    status: p.category,
    description: p.description,
    last_action_date: null,
    hearing_date: null,
  }))

  console.log(`Parsed ${records.length} Pineville records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
