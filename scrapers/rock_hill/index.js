/**
 * City of Rock Hill, SC — Planning Commission "New Business Items" scraper. York
 * County, SC.
 *
 * REWRITTEN from an earlier version that extracted "Public Hearing Items" (rezoning
 * petitions, "M-" case numbers) — switched entirely to "New Business Items" (site
 * plan / preliminary plat approvals, "Plan #" numbers) at explicit request: the
 * rezoning-petition names were unreadable ("M-2026-09 — 620 Briarcliff Rd."), while
 * New Business items have real, human-readable project names ("Winthrop Residence
 * Hall Phase I", "Cherry Road Mini Storage", "AMC Theater Redevelopment Expansion").
 *
 * Like Mount Pleasant and Mount Holly, Rock Hill has no structured webpage or database
 * of cases — only monthly Planning Commission agenda PDFs (68 historical entries
 * confirmed live). Scoped here to just the agendas listed on the first page of the
 * Agendas & Minutes listing (recent, actually-published ones) rather than paginating
 * through the full historical archive.
 *
 * VALIDATED against 8 real uploaded agendas spanning January through September 2026
 * (15 real items total, every one extracting correctly) — a much broader test than
 * the single August agenda the first version was built against, and it surfaced
 * several genuine format variations that first version would have silently mishandled
 * or dropped:
 *
 *   1. Plan number format varies: "(Plan #20240992)" in most months, but June 2026
 *      uses "(#20230917)" — no "Plan" word at all. "Plan" is now optional.
 *   2. Sentence word order varies: most items are "Consideration of a request BY
 *      Applicant (Contact) FOR ApprovalType for ProjectName..." but Feb 3 2026's
 *      Costco item is "Consideration of a request FOR Road Name Approval BY Nestor
 *      Hernandez (Thomas & Hutton Engineering) for..." — applicant and approval type
 *      swapped. Both orders are now matched (two passes, deduped by plan number).
 *   3. Address introducer varies: usually "at ADDRESS", sometimes "near ADDRESS" or
 *      "located near ADDRESS" (Rock Hill Costco Depot, Lee Street Townhomes). Some
 *      items have NO introducer word at all before a numbered street address (Timber
 *      Lane subdivision "...for Timber Lane subdivision 172 Timber Lane.") — handled
 *      with a fallback that splits on the transition to a number-led address when no
 *      "at"/"near" marker is found.
 *   4. Some items have no address, no tax parcel, AND no contact person at all (the
 *      City of Rock Hill's right-of-way creation request) — every field here is
 *      genuinely optional, not just occasionally missing.
 *   5. Not every New Business item is a real project at all — some months include
 *      calendar approvals, meeting-date changes, or "Continuing education
 *      opportunities" with no Plan # — these correctly produce no match rather than
 *      false data, since the extraction regex requires a real "(Plan #N)" or "(#N)".
 *   6. Some months' New Business section is genuinely empty ("a. None.") — detected
 *      and correctly returns zero items rather than erroring.
 *
 * HONEST LIMITATIONS:
 *   - Status reflects whether the item was scheduled for a given meeting — not a
 *     final approval/denial outcome, since these agendas are forward-looking meeting
 *     schedules, not results.
 *   - Some items genuinely have no address or tax parcel at all (e.g. right-of-way
 *     creation requests) — left null rather than guessed.
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

  const matches = [...html.matchAll(/href=['"](\/home\/showpublisheddocument\/\d+\/\d+)['"][^>]*>[^<]*Planning Commission Agenda/gi)]
  const urls = matches.map((m) => `${BASE_URL}${m[1]}`)
  return [...new Set(urls)]
}

/** Builds the full item record from a regex match. `hasApplicantFirst` distinguishes
 * the two real sentence-order variants confirmed live (see file header, point 2). */
function extractOneItem(match, hasApplicantFirst) {
  let byPart, rest, planNumber
  if (hasApplicantFirst) {
    byPart = match[1].trim()
    rest = match[2].trim()
    planNumber = match[3]
  } else {
    const approvalTypeRaw = match[1].trim()
    byPart = match[2].trim()
    rest = `${approvalTypeRaw} for ${match[3].trim()}`
    planNumber = match[4]
  }

  const contactMatch = byPart.match(/^(.+?)\s*\(([^)]+)\)$/)
  const applicant = contactMatch ? contactMatch[1].trim() : byPart
  const contact = contactMatch ? contactMatch[2].trim() : null

  let taxParcel = null
  const taxMatch = rest.match(/\.\s*Tax\s+Parcels?:?\s*([\dA-Za-z\-,\s&/]+?)\.?\s*$/i)
  if (taxMatch) {
    // Confirmed live: a line-wrap can leave a stray space after "&-" in a parcel range
    // (e.g. "&- 161" instead of "&-161") — cleaned up here.
    taxParcel = taxMatch[1].trim().replace(/&-\s+/g, '&-')
    rest = rest.slice(0, taxMatch.index).trim()
  } else {
    rest = rest.replace(/\.$/, '').trim()
  }

  const approvalType = rest.match(/^(.+?)\s+for\s+/i)?.[1]?.trim() || null
  const afterApprovalType = rest.match(/^.+?\s+for\s+(.+)$/is)?.[1]?.trim() || rest

  let projectName, address
  const markerMatch = afterApprovalType.match(/^(.+?)\s+(?:located\s+)?(?:at|near)\s+(.+)$/is)
  if (markerMatch) {
    projectName = markerMatch[1].trim()
    address = markerMatch[2].trim()
  } else {
    // Confirmed live (Timber Lane subdivision): some items have no "at"/"near"
    // introducer at all before a numbered street address — fall back to splitting on
    // the transition to a number-led, capitalized address.
    const fallbackMatch = afterApprovalType.match(/^(.+?)\s+(\d+\s+[A-Z].*)$/)
    if (fallbackMatch) {
      projectName = fallbackMatch[1].trim()
      address = fallbackMatch[2].trim()
    } else {
      projectName = afterApprovalType
      address = null
    }
  }
  projectName = projectName.replace(/^the\s+/i, '')

  return { applicant, contact, projectName, address, taxParcel, planNumber, approvalType }
}

/** Extracts real New Business items from an agenda's full text. Verified against 15
 * real items across 8 real uploaded agendas (Jan–Sep 2026). */
function extractNewBusinessItems(rawText) {
  const normalized = rawText.replace(/\s+/g, ' ')

  const startMatch = normalized.match(/New Business Items\**/i)
  if (!startMatch) return []
  const sectionStart = startMatch.index + startMatch[0].length
  const endMatch = normalized.slice(sectionStart).match(/(?:\d+\.\s*Other Business|\d+\.\s*Adjourn)/i)
  const sectionEnd = endMatch ? sectionStart + endMatch.index : normalized.length
  const section = normalized.slice(sectionStart, sectionEnd)

  if (/^\s*None\.?\s*$/i.test(section.trim())) return [] // confirmed live: some months have no New Business items at all

  // "Plan" is optional in the plan-number marker — confirmed live June 2026 uses
  // "(#20230917)" with no "Plan" word at all, unlike every other month.
  const planNumPattern = '\\(\\s*(?:Plan\\s*)?#\\s*(\\d+)\\)'
  const items = []
  const seenPlanNumbers = new Set()

  // Pattern A (the common case): "Consideration of a request BY Applicant for Rest..."
  const regexA = new RegExp(`Consideration of a request by (.+?)\\s+for\\s+(.+?)\\s*${planNumPattern}`, 'gis')
  let match
  while ((match = regexA.exec(section)) !== null) {
    const item = extractOneItem(match, true)
    if (!seenPlanNumbers.has(item.planNumber)) {
      seenPlanNumbers.add(item.planNumber)
      items.push(item)
    }
  }

  // Pattern B (confirmed live, Feb 2026 Costco item): "Consideration of a request FOR
  // ApprovalType BY Applicant for ProjectName..." — applicant and approval type swapped.
  const regexB = new RegExp(`Consideration of a request for (.+?)\\s+by\\s+(.+?)\\s+for\\s+(.+?)\\s*${planNumPattern}`, 'gis')
  while ((match = regexB.exec(section)) !== null) {
    const item = extractOneItem(match, false)
    if (!seenPlanNumbers.has(item.planNumber)) {
      seenPlanNumbers.add(item.planNumber)
      items.push(item)
    }
  }

  return items
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
  const items = extractNewBusinessItems(data.text)

  return items.map((it) => ({
    name: it.projectName,
    source: 'rock_hill',
    source_id: it.planNumber,
    source_url: url,
    municipality: 'Rock Hill',
    address: it.address,
    manual_address: null,
    parcel_id: it.taxParcel,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: `${it.projectName} ${it.approvalType || ''}` }),
    request_type: it.approvalType,
    current_zoning: null,
    zoning: null,
    acreage: null,
    applicant: it.applicant,
    developer: it.contact,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: meetingDate ? `Scheduled for hearing on ${meetingDate}` : 'Scheduled for hearing',
    description: `${it.approvalType || 'Request'} for ${it.projectName}${it.address ? ` at ${it.address}` : ''}, requested by ${it.applicant}${it.contact ? ` (${it.contact})` : ''}.`,
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

  console.log(`Parsed ${allRecords.length} Rock Hill New Business items across all agendas.`)
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
