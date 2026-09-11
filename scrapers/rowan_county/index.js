/**
 * Rowan County, NC — Planning Board rezoning petition reports scraper.
 *
 * Confirmed live: the Planning Board page (rowancountync.gov/1272/Planning-Board)
 * lists real 2026 case files by month, each with a linked "Planning Board Report" or
 * "Planning Board Packet" PDF specific to one rezoning case (e.g. "Z 02-26 Planning
 * Board Report", "Z 03-26 Planning Board Report Morgan Land Development"). Case
 * number prefix "Z" (not "ZTA" — text amendments, not property-specific) reliably
 * marks a real rezoning petition.
 *
 * KEY DISCOVERY, verified against a real uploaded report (Z 02-26): each report has a
 * genuinely rich, consistently-labeled sidebar — Request, Parcel IDs, Location,
 * Acreage, Owner / Applicant, Watershed, Floodplain, Stormwater, Existing
 * Improvements — far more detail than most sources in this project. Confirmed live
 * via real pdf-parse extraction: the sidebar's raw text appears AFTER the main body
 * text in extraction order (PDF text streams don't follow visual left-to-right
 * top-to-bottom layout), not before — field extraction searches for each label
 * anywhere in the normalized text rather than assuming a fixed position.
 *
 * The case number and owner/applicant name are also given cleanly in the report's
 * own header line: "REZONING PETITION: Z 02-26: Jeremy Good".
 *
 * HONEST LIMITATIONS:
 *   - Only covers cases from the CURRENT Planning Board page listing (this year) —
 *     the "Archived Case Files" links for prior years (2017-2025) are not scraped
 *     here, though the same report format likely applies if wanted later.
 *   - Some months bundle multiple case types into one combined PDF (e.g. "Z 01-26
 *     and SNIA 01-26 Planning Board Packet") — only the first "Z" case number found
 *     in the link text is used; the field extraction still applies to whatever
 *     sidebar content that PDF contains.
 *   - Acreage and Parcel IDs occasionally have a stray space from a PDF line-wrap
 *     (e.g. "514- 025") — cleaned up where straightforward, but not guaranteed
 *     perfectly formatted in every case.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const PLANNING_BOARD_PAGE = 'https://www.rowancountync.gov/1272/Planning-Board'
const BASE_URL = 'https://www.rowancountync.gov'

async function findCaseReportUrls() {
  const res = await fetch(PLANNING_BOARD_PAGE)
  if (!res.ok) throw new Error(`Planning Board page fetch failed: ${res.status}`)
  const html = await res.text()

  const matches = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>(Z\s*\d+-\d+(?!TA)[^<]*(?:Report|Packet)[^<]*)<\/a>/gi)]
  const seen = new Set()
  const urls = []
  for (const m of matches) {
    const href = m[1]
    if (seen.has(href)) continue
    seen.add(href)
    urls.push({ url: href.startsWith('http') ? href : `${BASE_URL}${href}`, linkText: m[2].trim() })
  }
  return urls
}

function extractField(text, label, nextLabels) {
  const allStops = [...nextLabels, 'Planning Board Meeting', 'REQUEST\\s+PLAN']
  const stopPattern = allStops.map((l) => l.replace(/\//g, '\\/')).join('|')
  const escapedLabel = label.replace(/\//g, '\\/')
  const pattern = new RegExp(`${escapedLabel}:\\s*(.+?)\\s*(?:${stopPattern}|$)`, 'i')
  const match = text.match(pattern)
  return match ? match[1].trim() : null
}

const SIDEBAR_LABELS = [
  'Request', 'Parcel IDs', 'Location', 'Acreage', 'Owner / Applicant',
  'Watershed', 'Floodplain', 'Stormwater', 'Existing Improvements',
]

function extractCaseReport(rawText, fallbackCaseNumber) {
  const normalized = rawText.replace(/\s+/g, ' ')

  const headerMatch = normalized.match(/REZONING PETITION:\s*(Z\s*\d+-\d+):\s*(.+?)\s*Request:/i)
  const caseNumber = headerMatch ? headerMatch[1].replace(/\s+/g, ' ').trim() : fallbackCaseNumber
  const ownerFromHeader = headerMatch ? headerMatch[2].trim() : null

  const fields = {}
  for (let i = 0; i < SIDEBAR_LABELS.length; i++) {
    const value = extractField(normalized, SIDEBAR_LABELS[i], SIDEBAR_LABELS.slice(i + 1))
    fields[SIDEBAR_LABELS[i]] = value ? value.replace(/-\s+/g, '-') : null
  }

  return {
    caseNumber,
    owner: fields['Owner / Applicant'] || ownerFromHeader,
    request: fields.Request,
    parcelIds: fields['Parcel IDs'],
    location: fields.Location,
    acreage: fields.Acreage,
  }
}

async function fetchCaseRecord({ url, linkText }) {
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  report fetch failed (${res.status}): ${url}`)
    return null
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const data = await pdfParse(buffer)

  const fallbackCaseNumber = linkText.match(/Z\s*\d+-\d+/i)?.[0] || linkText
  const parsed = extractCaseReport(data.text, fallbackCaseNumber)
  if (!parsed.request && !parsed.location) return null

  return {
    name: parsed.owner ? `${parsed.owner} — ${parsed.request || parsed.caseNumber}` : parsed.request || parsed.caseNumber,
    source: 'rowan_county',
    source_id: parsed.caseNumber,
    source_url: url,
    municipality: 'Rowan County',
    address: parsed.location,
    manual_address: null,
    parcel_id: parsed.parcelIds,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: parsed.request }),
    request_type: 'Rezoning',
    current_zoning: null,
    zoning: null,
    acreage: parsed.acreage,
    applicant: parsed.owner,
    developer: null,
    owner: parsed.owner,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: 'Scheduled for hearing',
    description: parsed.request,
    last_action_date: null,
    hearing_date: null,
  }
}

async function main() {
  const reportLinks = await findCaseReportUrls()
  console.log(`Found ${reportLinks.length} Rowan County case report/packet documents.`)

  const records = []
  for (const link of reportLinks) {
    const record = await fetchCaseRecord(link)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`Parsed ${records.length} Rowan County records.`)
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
