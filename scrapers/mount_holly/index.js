/**
 * City of Mount Holly, NC — Planning Commission rezoning case scraper. Gaston County.
 *
 * Like Mount Pleasant, Mount Holly has no structured webpage or database of cases —
 * only monthly Planning Commission meeting agenda PDFs. GENUINELY DIFFERENT from Mount
 * Pleasant's approach though: there's no rich "Monthly Update" staff memo with clean
 * Label:Value fields to lean on. These agendas are much thinner — confirmed live, one
 * real month (September 2026) had zero rezoning cases at all, just a variance and two
 * ordinance text amendments. So instead of scraping just the latest packet (which
 * might have nothing), this fetches EVERY available monthly agenda and extracts
 * whatever real rezoning items exist across all of them.
 *
 * KEY DISCOVERY, verified against 2 real uploaded agendas (July and August 2026): real
 * rezoning items consistently follow the pattern "Public hearing to consider [a]
 * rezoning of [Tax] Parcel #'s X, Y, Z from A to B [for the SITE NAME], Case [#] R-XX-X."
 * — and critically, the case number PREFIX itself ("R-" for Rezoning vs "TA-" for Text
 * Amendment, presumably others for Variance/Subdivision/etc.) is a reliable way to
 * filter for real rezoning cases specifically, rather than guessing from keywords.
 *
 * Confirmed live bug caught and fixed during testing: the "#" after "Case" is
 * inconsistent between months — July's agenda has "Case # R-26-3" (with #), August's
 * has "Case R-26-4" (no #). The extraction regex makes the # optional throughout to
 * handle both.
 *
 * HONEST LIMITATIONS:
 *   - These are hearings SCHEDULED for a given Planning Commission meeting — not a
 *     confirmation of approval/denial. Status reflects "scheduled for hearing on
 *     [date]", not a final outcome, since these agendas don't report back results.
 *   - No acreage field exists in this format at all — left null.
 *   - "address" is really a "site name" the agenda item happens to include (e.g. "1714
 *     North Main Street Mixed Use Site") when present — not present for every case
 *     (confirmed live: July's single-parcel case had no site name at all).
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const PLANNING_COMMISSION_PAGE =
  'https://www.mtholly.us/government/boards_and_commissions/planning_commission__board_of_adjustments.php'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

async function findAgendaUrls() {
  const res = await fetch(PLANNING_COMMISSION_PAGE)
  if (!res.ok) throw new Error(`Planning Commission page fetch failed: ${res.status}`)
  const html = await res.text()

  // Tolerant of both a literal space and %20 encoding in the raw href, AND of an
  // unusual space between "href=" and the opening quote confirmed live in this site's
  // actual HTML output (<a href= "..."> — yes, really, with a space there).
  const matches = [...html.matchAll(/href=\s*"([^"]*PC(?:%20| )Agenda[^"]*\.pdf[^"]*)"/gi)]
  const urls = matches.map((m) => {
    const href = m[1].replace(/&amp;/g, '&').replace(/ /g, '%20') // encode literal spaces, confirmed present in the raw href
    return href.startsWith('http') ? href : `https://www.mtholly.us/${href}`
  })
  return [...new Set(urls)]
}

function extractMeetingDate(text) {
  const match = text.match(/([A-Z]+),\s+([A-Z]+)\s+(\d{1,2}),\s+(\d{4})/)
  if (!match) return null
  const monthIdx = MONTH_NAMES.indexOf(match[2])
  if (monthIdx === -1) return null
  const month = String(monthIdx + 1).padStart(2, '0')
  const day = match[3].padStart(2, '0')
  return `${match[4]}-${month}-${day}`
}

function extractRezoningItems(agendaText) {
  const itemRegex = /\n(\d+)\.\s+([\s\S]*?)(?=\n\d+\.\s+|$)/g
  const items = []
  let match
  while ((match = itemRegex.exec('\n' + agendaText)) !== null) {
    items.push(match[2].trim())
  }
  return items.filter((item) => /Case\s*#?\s*R-\d+-\d+/i.test(item))
}

function parseRezoningItem(itemText) {
  // Confirmed live against the real PDF text: (1) the source PDF uses a smart/curly
  // apostrophe (’, U+2019) in "Parcel #’s", not a plain ASCII one — matched here with
  // \S* instead of a literal character. (2) Field values sometimes span a line break
  // from the PDF's natural text wrapping (e.g. "to City \nConditional District..."),
  // which JS's `.` doesn't match by default — normalizing all whitespace to single
  // spaces first avoids needing special-case regex flags for this.
  const normalized = itemText.replace(/\s+/g, ' ').trim()

  const caseMatch = normalized.match(/Case\s*#?\s*(R-\d+-\d+)/i)
  const caseNumber = caseMatch ? caseMatch[1] : null

  const parcelMatch = normalized.match(/(?:Tax\s+)?Parcel\s*#\S*\s*([\d,\s&]+?)(?:\s+from\s)/i)
  const parcelIds = parcelMatch ? parcelMatch[1].match(/\d{5,7}/g) || [] : []

  const zoningMatch = normalized.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+for\s+|\.|,\s*Case)/i)
  const currentZoning = zoningMatch ? zoningMatch[1].trim() : null
  const proposedZoning = zoningMatch ? zoningMatch[2].trim() : null

  const siteMatch = normalized.match(/for\s+the\s+(.+?),?\s*Case\s*#?/i)
  const siteName = siteMatch ? siteMatch[1].trim() : null

  return { caseNumber, parcelIds, currentZoning, proposedZoning, siteName }
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
  const items = extractRezoningItems(data.text)

  return items
    .map((itemText) => {
      const parsed = parseRezoningItem(itemText)
      if (!parsed.caseNumber) return null

      return {
        name: parsed.siteName || `${parsed.caseNumber} (${parsed.parcelIds.join(', ') || 'parcel TBD'})`,
        source: 'mount_holly',
        source_id: parsed.caseNumber,
        source_url: url,
        municipality: 'Mount Holly',
        address: parsed.siteName,
        manual_address: null,
        parcel_id: parsed.parcelIds.join(', ') || null,
        latitude: null,
        longitude: null,
        project_type: classifyProjectType({ description: itemText }),
        request_type: 'Rezoning',
        current_zoning: parsed.currentZoning,
        zoning: parsed.proposedZoning,
        acreage: null,
        applicant: null,
        developer: null,
        owner: null,
        owner_mailing_address: null,
        contact_email: null,
        contact_phone: null,
        manual_contact_email: null,
        manual_contact_phone: null,
        status: meetingDate ? `Scheduled for hearing on ${meetingDate}` : 'Scheduled for hearing',
        description: itemText,
        last_action_date: meetingDate,
        hearing_date: meetingDate,
      }
    })
    .filter(Boolean)
}

async function main() {
  const agendaUrls = await findAgendaUrls()
  console.log(`Found ${agendaUrls.length} Mount Holly Planning Commission agendas.`)

  const allRecords = []
  for (const url of agendaUrls) {
    const records = await fetchAgendaRecords(url)
    allRecords.push(...records)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`Parsed ${allRecords.length} Mount Holly rezoning items across all agendas.`)
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
