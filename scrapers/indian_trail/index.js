/**
 * Town of Indian Trail, NC — Development Projects scraper. Union County.
 *
 * UPDATED: the original version only scraped the summary table (Project Number,
 * Name, Status, Description) and never got real addresses — confirmed live, the
 * table has no address column at all, so every record skipped geocoding entirely
 * and zero map points ever showed up for this town. Investigation found that each
 * project's INDIVIDUAL detail page (e.g. /1829/3s-Pebble-Creek-Golf, not linked from
 * anywhere else in this scraper before) has a real "Location" field with a real
 * street address and parcel ID(s) — this version fetches all 97 detail pages to
 * pull that out.
 *
 * Confirmed live: a single listing page (indiantrail.org/625/Development-Projects-
 * in-Indian-Trail) lists every real development project across 4 tabs — Proposed,
 * Approved, Completed, Denied/Withdrawn — each rendered as a genuinely clean HTML
 * TABLE. Columns: Project Number, Project Name (with a link to an individual page),
 * Status, Description. Confirmed live: 97 real projects total across all 4 tabs.
 *
 * Tab boundaries: each tab panel has an id like "tab{UUID}_N" (N=0 Introduction, 1
 * Proposed, 2 Approved, 3 Completed, 4 Denied/Withdrawn) — the UUID itself is
 * per-page-load, so this locates them dynamically via regex rather than a hardcoded
 * value, then uses the byte-offset ordering (confirmed live to be strictly sequential
 * in the raw HTML) to slice out each tab's own section before extracting its rows.
 *
 * Each table cell has a `data-th="Column Name"` attribute, confirmed live, which lets
 * cells be extracted by column name regardless of column order.
 *
 * REAL FORMAT INCONSISTENCY found across 3 real example detail pages — the "Location"
 * field is NOT one consistent format:
 *   1. "6207 W Hwy 74, Parcel ID #07087006" — address, comma, singular "Parcel ID #"
 *   2. "13901 W Highway 74 & 116 Independence Dr.Parcels: 07084355, ..." — address,
 *      then (no separator at all after tag-stripping) plural "Parcels:" with a list
 *   3. "Parcel #07048065" — NO street address at all, just a bare parcel number
 * Handled with one flexible regex tolerant of singular/plural, with/without "ID",
 * with/without a comma, and an address that may be completely absent.
 *
 * HONEST LIMITATIONS:
 *   - Fetches 97 individual pages (one per project) with a courtesy delay between
 *     requests — this scraper takes noticeably longer to run than a single-page one.
 *   - A few projects' Location field may still be missing or unusually formatted;
 *     those fall back to the same description-based location-hint extraction the
 *     original version used.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PROJECTS_PAGE_URL = 'https://www.indiantrail.org/625/Development-Projects-in-Indian-Trail'
const BASE_URL = 'https://www.indiantrail.org'

const TAB_LABELS = {
  1: 'Proposed',
  2: 'Approved',
  3: 'Completed',
  4: 'Denied/Withdrawn',
}

function getCellValue(rowHtml, columnName) {
  const pattern = new RegExp(`data-th="${columnName}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i')
  const match = rowHtml.match(pattern)
  if (!match) return null
  const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  return text || null
}

function getCellLink(rowHtml, columnName) {
  const pattern = new RegExp(`data-th="${columnName}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i')
  const cellMatch = rowHtml.match(pattern)
  if (!cellMatch) return null
  const hrefMatch = cellMatch[1].match(/href="([^"]+)"/)
  return hrefMatch ? hrefMatch[1] : null
}

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d.]+)\s*acres/i)
  return match ? match[1] : null
}

function extractLocationHint(text) {
  if (!text) return null
  const match = text.match(/(?:located\s+)?(?:off|along|near|at)\s+([A-Z][A-Za-z0-9.\-' ]+?)(?:\.|,|$)/i)
  return match ? match[1].trim() : null
}

/** Parses the real Location cell text, tolerant of every format variation confirmed
 * live: "ADDRESS, Parcel ID #N", "ADDRESSParcels: N1, N2, N3" (no separator after tag
 * stripping), "ADDRESS (Parcels N1, N2, N3)" (parenthetical, used on older/legacy
 * project pages), or just "Parcel #N" with no address at all. */
function parseLocationCell(text) {
  if (!text) return { location: null, parcels: null }
  const parenMatch = text.match(/^(.*?)\s*\(Parcels?\s*([\dA-Za-z,\s]+)\)\s*$/i)
  if (parenMatch) {
    return { location: parenMatch[1].trim() || null, parcels: parenMatch[2].replace(/\s+/g, ' ').trim() }
  }
  const match = text.match(/^(.*?),?\s*Parcels?:?\s*(?:ID\s*#|#)?\s*([\dA-Za-z,\s]+)$/i)
  if (match) {
    return { location: match[1].trim() || null, parcels: match[2].replace(/\s+/g, ' ').trim() }
  }
  return { location: text.trim() || null, parcels: null }
}

async function fetchProjectDetail(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return { location: null, parcels: null }
    const html = await res.text()
    // Confirmed live: TWO real page templates exist across Indian Trail's 97 projects
    // — most (newer projects) use a table row (<td><strong>Location</strong></td>
    // <td>VALUE</td>), but older/legacy projects (e.g. one from 2001) use a paragraph
    // instead (<p><strong>Location:&nbsp;</strong>VALUE</p>). Both are tried in turn.
    let match = html.match(/<strong>\s*Location\s*<\/strong>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
    if (!match) {
      match = html.match(/<strong>\s*Location:?\s*(?:&nbsp;)?\s*<\/strong>([\s\S]*?)<\/p>/i)
    }
    if (!match) return { location: null, parcels: null }
    const cellText = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    return parseLocationCell(cellText)
  } catch (err) {
    console.warn(`  detail fetch failed for ${url}: ${err.message}`)
    return { location: null, parcels: null }
  }
}

async function fetchProjects() {
  const res = await fetch(PROJECTS_PAGE_URL)
  if (!res.ok) throw new Error(`Projects page fetch failed: ${res.status}`)
  const html = await res.text()

  const tabMatches = [...html.matchAll(/id="tab[a-f0-9-]+_(\d)"/g)].map((m) => ({
    tabNum: Number(m[1]),
    index: m.index,
  }))

  const allProjects = []
  for (let i = 0; i < tabMatches.length; i++) {
    const { tabNum, index } = tabMatches[i]
    const label = TAB_LABELS[tabNum]
    if (!label) continue
    const sectionEnd = i + 1 < tabMatches.length ? tabMatches[i + 1].index : html.length
    const section = html.slice(index, sectionEnd)

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
    let rowMatch
    while ((rowMatch = rowRegex.exec(section)) !== null) {
      const rowHtml = rowMatch[1]
      const projectNumber = getCellValue(rowHtml, 'Project Number')
      const projectName = getCellValue(rowHtml, 'Project Name')
      if (!projectNumber || !projectName) continue
      const status = getCellValue(rowHtml, 'Status') || label
      const description = getCellValue(rowHtml, 'Description')
      const href = getCellLink(rowHtml, 'Project Name')

      allProjects.push({
        projectNumber,
        projectName,
        status,
        description,
        url: href ? (href.startsWith('http') ? href : `${BASE_URL}${href}`) : PROJECTS_PAGE_URL,
      })
    }
  }
  return allProjects
}

function cleanAddressForGeocoding(location) {
  if (!location) return location
  // Confirmed live: some locations are semicolon-separated compound descriptions
  // ("4917 Rocky River Rd; Southwest sector at roundabout intersection...") where
  // only the first segment is a real, geocodable street address. When the first
  // segment starts with a number (a real address), prefer just that segment.
  if (location.includes(';')) {
    const firstSegment = location.split(';')[0].trim()
    if (/^\d/.test(firstSegment)) return firstSegment
  }
  return location
}

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Indian Trail development projects.`)

  const records = []
  for (const p of projects) {
    const { location, parcels } = await fetchProjectDetail(p.url)
    const address = cleanAddressForGeocoding(location) || extractLocationHint(p.description) // fall back to description-based hint if the detail page had none
    records.push({
      name: p.projectName,
      source: 'indian_trail',
      source_id: p.projectNumber,
      source_url: p.url,
      municipality: 'Indian Trail',
      address,
      manual_address: null,
      parcel_id: parcels,
      latitude: null,
      longitude: null,
      project_type: classifyProjectType({ description: p.description }),
      request_type: null,
      current_zoning: null,
      zoning: null,
      acreage: extractAcreage(p.description),
      applicant: null,
      developer: null,
      owner: null,
      owner_mailing_address: null,
      contact_email: null,
      contact_phone: null,
      manual_contact_email: null,
      manual_contact_phone: null,
      status: p.status,
      description: p.description,
      last_action_date: null,
      hearing_date: null,
    })
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`Parsed ${records.length} Indian Trail records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
