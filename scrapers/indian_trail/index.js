/**
 * Town of Indian Trail, NC — Development Projects scraper. Union County.
 *
 * Confirmed live: a single page (indiantrail.org/625/Development-Projects-in-Indian-Trail)
 * lists every real development project across 4 tabs — Proposed, Approved, Completed,
 * Denied/Withdrawn — each rendered as a genuinely clean HTML TABLE (not an accordion
 * list like Monroe's equivalent page, despite both being CivicPlus sites — confirmed
 * live these are structurally different). Columns: Project Number, Project Name (with
 * a link to an individual page), Status, Description. Confirmed live: 97 real projects
 * total across all 4 tabs (18 Proposed, 49 Approved, 28 Completed, 2 Denied/Withdrawn)
 * — the biggest single-town count in this project so far.
 *
 * Tab boundaries: each tab panel has an id like "tab{UUID}_N" (N=0 Introduction, 1
 * Proposed, 2 Approved, 3 Completed, 4 Denied/Withdrawn) — the UUID itself is
 * per-page-load, so this locates them dynamically via regex rather than a hardcoded
 * value, then uses the byte-offset ordering (confirmed live to be strictly sequential
 * in the raw HTML) to slice out each tab's own section before extracting its rows.
 *
 * Each table cell has a `data-th="Column Name"` attribute, confirmed live, which lets
 * cells be extracted by column name regardless of column order — more robust than
 * relying on fixed cell position.
 *
 * HONEST LIMITATIONS:
 *   - No dedicated address field — only Description text, which inconsistently
 *     includes a location reference. Geocoding will have limited success, same
 *     honest pattern as Monroe's equivalent page.
 *   - Only the base listing page is used — individual per-project pages (e.g.
 *     /1829/3s-Pebble-Creek-Golf) are NOT fetched separately, since (following the
 *     same finding as Monroe) the listing page's own Description column already
 *     carries the real substance for most projects.
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

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Indian Trail development projects.`)

  const records = projects.map((p) => {
    const locationHint = extractLocationHint(p.description)
    return {
      name: p.projectName,
      source: 'indian_trail',
      source_id: p.projectNumber,
      source_url: p.url,
      municipality: 'Indian Trail',
      address: locationHint,
      manual_address: null,
      parcel_id: null,
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
    }
  })

  console.log(`Parsed ${records.length} Indian Trail records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
