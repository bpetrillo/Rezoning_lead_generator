/**
 * Town of Mount Pleasant, NC — Planning & Zoning case scraper. Cabarrus County.
 *
 * GENUINELY DIFFERENT from every other scraper in this project: Mount Pleasant
 * publishes NO structured webpage or database of cases at all — only PDF meeting
 * agenda packets (confirmed live: static Comprehensive Plan/ordinance documents, no
 * case listing page, no ArcGIS layer). This scraper extracts real structured data from
 * inside those PDFs instead.
 *
 * KEY DISCOVERY (verified against a real uploaded packet, PZ Agenda 8-24-2026.pdf):
 * every monthly agenda packet contains a staff memo titled "Monthly Update for
 * Planning, Economic Development, & Infrastructure Projects" with a section called
 * "Active Planning & Zoning Cases" — and this section is NOT just that month's new
 * cases, it's a ROLLING SNAPSHOT of every currently-active case (confirmed: the August
 * 2026 packet includes SUB 2017-01 "Green Acres" and SUB 2020-03 "Brighton Park",
 * years-old projects still under construction). This means scraping just the MOST
 * RECENT packet gets the full current picture — no need to parse every historical PDF.
 *
 * Within that section, each case follows a strict "Label: Value" format (Description,
 * Location, a parcel-number field under one of several label variants, Zoning fields,
 * Area, Status) — genuinely parseable, confirmed against all 11 real cases in the test
 * packet, including catching and fixing two real bugs: (1) page-break artifacts
 * (blank line + standalone page number + blank line) landing mid-field, and (2)
 * irregular double-spacing in the source PDF itself ("Current  Status:" with two
 * spaces) breaking exact-space label matching — fixed with \s+ in the label regex.
 *
 * Uses `pdf-parse` (a pure npm package, cross-platform) rather than shelling out to
 * system PDF tools like `pdftotext`, so this doesn't require installing anything
 * outside `npm install` — consistent with every other scraper in this project.
 *
 * HONEST LIMITATIONS:
 *   - No clean discrete date field exists for last_action_date — Status is prose
 *     ("Neighborhood Meeting held August 18"), too ambiguous to reliably parse into a
 *     real date (which year? relative to which meeting?). Left null rather than
 *     guessing wrong.
 *   - Applicant is only populated for cases that explicitly list one (most Town-
 *     initiated rezonings don't name a separate applicant).
 *   - NOT wired into Mecklenburg County's Polaris enrichment — Cabarrus County parcels
 *     aren't in that system.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { createRequire } from 'module'

// pdf-parse@1.1.1 has known leftover debug/self-test code that checks
// `!module.parent` to decide whether to run its own internal test (loading a
// hardcoded test PDF that doesn't exist outside the package). Under Node's ESM/CJS
// interop, a plain `import pdfParse from 'pdf-parse'` leaves `module.parent`
// undefined, incorrectly triggering that debug path and crashing with an ENOENT for
// a nonexistent test file — confirmed live. Loading it through an explicit
// createRequire (a genuine CommonJS require call) avoids this entirely.
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const AGENDAS_PAGE_URL = 'https://mtpleasantnc.gov/Government/Planning-Economic-Development/Agendas-Minutes'
const BASE_URL = 'https://mtpleasantnc.gov'

const FIELD_LABELS = [
  'Description',
  'Location',
  'Cabarrus\\s+County\\s+Parcel\\s+Number\\(s\\)',
  'Cabarrus\\s+County\\s+Parcel\\s+Number',
  'Cabarrus\\s+PINs',
  'Cabarrus\\s+PIN',
  'PIN',
  'Current\\s+Zoning',
  'Proposed\\s+Zoning',
  'Zoning',
  'Area',
  'Applicant',
  'Proposed\\s+Density',
  'Density',
  'Estimated\\s+Sewer\\s+Capacity\\s+Usage',
  'Current\\s+Status',
  'Status',
]
const LABEL_ALTERNATION = FIELD_LABELS.join('|')

/** Finds the most recent "Full Agenda Packet" PDF link on the Agendas & Minutes page.
 * Confirmed live: these are listed newest-first, and the "Full Agenda Packet" link
 * consistently appears before the "Minutes" link within each row, so the first
 * matching PDF link in raw page order is the most recent packet.
 *
 * The regex is deliberately tolerant of inconsistent URL encoding — confirmed live,
 * the real href has literal spaces through most of the path but %20-encodes the
 * filename itself ("/Portals/0/Mount Pleasant/.../PZ%20Agenda%208-24-2026.pdf"),
 * which a stricter fully-encoded pattern would miss entirely. */
async function findLatestAgendaPdfUrl() {
  const res = await fetch(AGENDAS_PAGE_URL)
  if (!res.ok) throw new Error(`Agendas page fetch failed: ${res.status}`)
  const html = await res.text()
  const match = html.match(/href="([^"]*\/Portals\/[^"]*\.pdf[^"]*)"/i)
  if (!match) throw new Error('No agenda PDF link found on the Agendas & Minutes page.')
  const href = match[1].replace(/&amp;/g, '&')
  return href.startsWith('http') ? href : `${BASE_URL}${href}`
}

/** Strips the page-break artifact confirmed live in these PDFs: a blank line, a
 * standalone page number, and another blank line landing mid-paragraph. */
function stripPageNumbers(text) {
  return text.replace(/\n\s*\n\d+\s*\n\s*\n/g, '\n\n')
}

function normalizeLabel(rawLabel) {
  return rawLabel.replace(/\s+/g, ' ').trim()
}

function parseCaseBlock(block) {
  const firstLineEnd = block.indexOf('\n')
  const firstLine = block.slice(0, firstLineEnd).trim()
  const caseNumMatch = firstLine.match(/^(REZ|SUB|SITE)\s+(\d{4}-\d+)/)
  if (!caseNumMatch) return null
  const caseNumber = `${caseNumMatch[1]} ${caseNumMatch[2]}`
  const caseTypePrefix = caseNumMatch[1]
  const title = firstLine.replace(/^(REZ|SUB|SITE)\s+\d{4}-\d+\s*/, '').trim()

  const fields = {}
  const labelRegex = new RegExp(`(${LABEL_ALTERNATION}):\\s*([\\s\\S]*?)(?=\\n(?:${LABEL_ALTERNATION}):|$)`, 'g')
  let match
  while ((match = labelRegex.exec(block)) !== null) {
    const label = normalizeLabel(match[1])
    const value = match[2].replace(/\s+/g, ' ').trim()
    if (!fields[label]) fields[label] = value
  }

  return { caseNumber, caseTypePrefix, title, fields }
}

function getFirstField(fields, keys) {
  for (const key of keys) {
    if (fields[key]) return fields[key]
  }
  return null
}

function extractAcreage(areaText) {
  if (!areaText) return null
  const match = areaText.match(/([\d.]+)\s*ac/i)
  return match ? match[1] : null
}

const REQUEST_TYPE_BY_PREFIX = {
  REZ: 'Rezoning',
  SUB: 'Subdivision',
  SITE: 'Site Plan',
}

async function fetchAndParseAgenda() {
  const pdfUrl = await findLatestAgendaPdfUrl()
  console.log(`Using most recent agenda packet: ${pdfUrl}`)

  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const data = await pdfParse(buffer)

  const startIdx = data.text.indexOf('Active Planning & Zoning Cases')
  if (startIdx === -1) {
    console.warn('Could not find "Active Planning & Zoning Cases" section in this packet — skipping.')
    return []
  }
  // Section end boundary — tries known next-section headers in case the report format
  // shifts slightly month to month. NOTE: 'Permits' was tried here and removed — it's
  // too generic and matched inside a case's own wrapped status text ("...Zoning
  // Permits being issued...", confirmed live in SUB 2020-03's real status), truncating
  // the section early and losing the final case entirely.
  const possibleEndMarkers = ['Code of Ordinances', 'WSACC', 'Active Infrastructure Projects']
  let endIdx = data.text.length
  for (const marker of possibleEndMarkers) {
    const idx = data.text.indexOf(marker, startIdx + 100)
    if (idx !== -1 && idx < endIdx) endIdx = idx
  }

  let section = data.text.slice(startIdx, endIdx)
  section = stripPageNumbers(section)

  const blocks = section
    .split(/(?=^(?:REZ|SUB|SITE)\s+\d{4}-\d+)/m)
    .filter((b) => /^(REZ|SUB|SITE)\s+\d{4}-\d+/.test(b.trim()))

  const parsedCases = blocks.map(parseCaseBlock).filter(Boolean)

  return parsedCases.map((c) => {
    const address = c.fields['Location']
    const parcelId = getFirstField(c.fields, [
      'Cabarrus County Parcel Number(s)',
      'Cabarrus County Parcel Number',
      'Cabarrus PINs',
      'Cabarrus PIN',
      'PIN',
    ])
    const status = getFirstField(c.fields, ['Current Status', 'Status'])
    const currentZoning = c.fields['Current Zoning'] || c.fields['Zoning'] || null
    const proposedZoning = c.fields['Proposed Zoning'] || null

    return {
      name: `${c.caseNumber} ${c.title}`,
      source: 'mount_pleasant',
      source_id: c.caseNumber,
      source_url: pdfUrl,
      municipality: 'Mount Pleasant',
      address,
      manual_address: null,
      parcel_id: parcelId,
      latitude: null,
      longitude: null,
      project_type: classifyProjectType({ description: c.fields['Description'] }),
      request_type: REQUEST_TYPE_BY_PREFIX[c.caseTypePrefix] || null,
      current_zoning: currentZoning,
      zoning: proposedZoning,
      acreage: extractAcreage(c.fields['Area']),
      applicant: c.fields['Applicant'] || null,
      developer: null,
      owner: null,
      owner_mailing_address: null,
      contact_email: null,
      contact_phone: null,
      manual_contact_email: null,
      manual_contact_phone: null,
      status,
      description: c.fields['Description'] || null,
      last_action_date: null,
      hearing_date: null,
    }
  })
}

async function main() {
  const records = await fetchAndParseAgenda()
  console.log(`Parsed ${records.length} Mount Pleasant cases.`)
  if (records.length === 0) {
    console.log('No records to upsert.')
    return
  }
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
