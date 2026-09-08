/**
 * City of Rock Hill, SC — Planning Commission rezoning petition scraper. York County,
 * SC — first town in this state and county for this project.
 *
 * Like Mount Pleasant and Mount Holly, Rock Hill has no structured webpage or database
 * of cases — only monthly Planning Commission agenda PDFs (68 historical entries
 * confirmed live, going back well over a year). Scoped here to just the agendas
 * listed on the first page of the Agendas & Minutes listing (recent, actually-
 * published ones — several future-dated entries show "Not Included" since no PDF
 * exists yet) rather than paginating through the full historical archive.
 *
 * KEY DISCOVERY, verified against a real uploaded agenda (August 4, 2026): real
 * rezoning petitions consistently follow the pattern "petition M-YYYY-NN by
 * [Applicant] ([Org]) to [annex and ]rezone approximately X acres [including
 * right-of-way] at [ADDRESS] from [CURRENT ZONING] to [PROPOSED ZONING]. Tax Parcel:
 * XXX-XX-XX-XXX." — and critically, the "M-" case-number prefix reliably marks a
 * real rezoning petition, distinguishing it from "T-" (text/ordinance amendments,
 * not property-specific) — same pattern already proven for Mount Holly's "R-" vs
 * "TA-" prefixes.
 *
 * Confirmed live bug caught and fixed during testing: the PDF's real extracted text
 * has a stray space after the hyphen in case numbers ("M- 2026-08" instead of
 * "M-2026-08"), a line-wrap artifact — missing this caused one of the two real cases
 * in the test PDF to be silently skipped. Fixed by allowing optional whitespace
 * around the hyphen in the case-number pattern.
 *
 * HONEST LIMITATIONS:
 *   - Status reflects whether the item was scheduled and whether it was explicitly
 *     marked "deferred by the applicant" in that agenda — not a final approval/denial
 *     outcome, since these agendas are forward-looking hearing schedules, not results.
 *   - "New Business" site-plan/plat items (a separate section using "Plan #" numbers)
 *     are NOT included — scope is limited to actual rezoning petitions ("M-" cases)
 *     to stay consistent with the rest of this project.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const AGENDAS_PAGE_URL =
  'https://www.cityofrockhill.com/government/boards-commissions/boards-commissions-agendas-minutes/planning-commission-agendas-minutes'
const BASE_URL = 'https://www.cityofrockhill.com'

async function findAgendaUrls() {
  const res = await fetch(AGENDAS_PAGE_URL)
  if (!res.ok) throw new Error(`Agendas page fetch failed: ${res.status}`)
  const html = await res.text()

  // Tolerant of both single and double quotes around the href attribute — confirmed
  // live this page uses single quotes (href='...'), not the double quotes assumed
  // originally.
  const matches = [...html.matchAll(/href=['"](\/home\/showpublisheddocument\/\d+\/\d+)['"][^>]*>[^<]*Planning Commission Agenda/gi)]
  const urls = matches.map((m) => `${BASE_URL}${m[1]}`)
  return [...new Set(urls)]
}

function extractRezoningCases(rawText) {
  const normalized = rawText.replace(/\s+/g, ' ')
  const regex =
    /petition\s+(M\s*-\s*\d{4}-\d+)\s+by\s+(.+?)\s+to\s+(?:annex and )?rezone\s+approximately\s+([\d.]+)\s+acres(?:\s+including\s+right-of-way)?\s+at\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)\.\s*Tax\s+Parcel:?\s*([\d\-,\s&]+?)(?:\.|\s+This item|$)/gis
  const cases = []
  let match
  while ((match = regex.exec(normalized)) !== null) {
    const windowAfter = normalized.slice(match.index, match.index + 500)
    cases.push({
      caseNumber: match[1].replace(/\s+/g, ''),
      applicant: match[2].trim(),
      acreage: match[3],
      address: match[4].trim(),
      currentZoning: match[5].trim(),
      proposedZoning: match[6].trim(),
      taxParcel: match[7].replace(/\s+/g, '').trim(),
      deferred: /deferred/i.test(windowAfter),
    })
  }
  return cases
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function extractMeetingDate(text) {
  const monthPattern = MONTH_NAMES.join('|')
  const match = text.match(new RegExp(`(${monthPattern})\\s+(\\d{1,2}),\\s+(\\d{4})`, 'i'))
  if (!match) return null
  const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === match[1].toLowerCase())
  if (monthIdx === -1) return null
  const month = String(monthIdx + 1).padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `${match[3]}-${month}-${day}`
}

async function fetchAgendaRecords(url) {
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  agenda fetch failed (${res.status}): ${url}`)
    return []
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const data = await pdfParse(buffer)

  const meetingDate = extractMeetingDate(data.text)
  const cases = extractRezoningCases(data.text)

  return cases.map((c) => ({
    name: `${c.caseNumber} — ${c.address}`,
    source: 'rock_hill',
    source_id: c.caseNumber,
    source_url: url,
    municipality: 'Rock Hill',
    address: c.address,
    manual_address: null,
    parcel_id: c.taxParcel,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: `${c.currentZoning} to ${c.proposedZoning}` }),
    request_type: 'Rezoning',
    current_zoning: c.currentZoning,
    zoning: c.proposedZoning,
    acreage: c.acreage,
    applicant: c.applicant,
    developer: null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: c.deferred ? 'Deferred by applicant' : meetingDate ? `Scheduled for hearing on ${meetingDate}` : 'Scheduled for hearing',
    description: `Rezone ${c.acreage} acres at ${c.address} from ${c.currentZoning} to ${c.proposedZoning}.`,
    last_action_date: meetingDate,
    hearing_date: meetingDate,
  }))
}

async function main() {
  const agendaUrls = await findAgendaUrls()
  console.log(`Found ${agendaUrls.length} Rock Hill Planning Commission agendas.`)

  const allRecords = []
  for (const url of agendaUrls) {
    const records = await fetchAgendaRecords(url)
    allRecords.push(...records)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`Parsed ${allRecords.length} Rock Hill rezoning petitions across all agendas.`)
  if (allRecords.length === 0) {
    console.log('No records to upsert.')
    return
  }

  await geocodeRecords(allRecords)
  await upsertProjects(allRecords)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
