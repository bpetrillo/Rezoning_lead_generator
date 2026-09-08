/**
 * City of Monroe, NC — Development Projects scraper. Union County — first town in
 * this county.
 *
 * Confirmed live: a single page (monroenc.org/278/Development-Projects) lists every
 * real development project with a genuinely clean, consistent HTML structure — each
 * project is a `<li class="megaMenuItem widgetItem" data-pageid="X">` containing a
 * `.widgetTitle > a` (name + link to an individual page) and a `.widgetDesc`
 * paragraph (a real description that almost always embeds acreage, lot count, and
 * rezoning type — e.g. "condition district rezoning development consisting of 77
 * single-family detached lots to be constructed on 26.07 acres"). Confirmed live: 44
 * real projects on this one page as of writing.
 *
 * IMPORTANT: individual per-project pages DO exist (e.g. /279/Alexander-Commons), but
 * confirmed live via plain fetch that the SAME depth of content already appears
 * directly on this one listing page — even richer entries like "Sycamore Apartments"
 * (which includes Project Status, developer name, and a real mailing address) are
 * fully present in the listing page's raw HTML, not hidden behind a separate fetch.
 * So this scraper only needs ONE page fetch, not 44 — genuinely simpler than Belmont's
 * equivalent pattern, which needed a full page fetch per project.
 *
 * HONEST LIMITATIONS:
 *   - No explicit case number, status, or date field for most projects — only
 *     "Sycamore Apartments" happens to include Project Status/developer info inline;
 *     most others are just a name + one descriptive paragraph.
 *   - Location text embedded in the description ("located off Waxhaw Highway") is
 *     often too vague to geocode reliably — expected partial success, same honest
 *     pattern as several other towns in this project.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PROJECTS_PAGE_URL = 'https://www.monroenc.org/278/Development-Projects'
const BASE_URL = 'https://www.monroenc.org'

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d.]+)\s*acres/i)
  return match ? match[1] : null
}

function extractLocationHint(text) {
  if (!text) return null
  const match = text.match(/(?:located\s+)?(?:off|along|near)\s+([A-Z][A-Za-z0-9.\-' ]+?)(?:\.|,|$)/i)
  return match ? match[1].trim() : null
}

async function fetchProjects() {
  const res = await fetch(PROJECTS_PAGE_URL)
  if (!res.ok) throw new Error(`Projects page fetch failed: ${res.status}`)
  const html = await res.text()

  const itemRegex =
    /<li class="megaMenuItem widgetItem" data-pageid="(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<p class="widgetDesc">([\s\S]*?)<\/p>/g

  const projects = []
  let match
  while ((match = itemRegex.exec(html)) !== null) {
    const [, pageId, href, name, descriptionRaw] = match
    const description = decodeHtmlEntities(descriptionRaw).replace(/\s+/g, ' ').trim()
    projects.push({
      pageId,
      url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
      name: decodeHtmlEntities(name).trim(),
      description,
    })
  }
  return projects
}

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Monroe development projects.`)

  const records = projects.map((p) => {
    const locationHint = extractLocationHint(p.description)
    return {
      name: p.name,
      source: 'monroe',
      source_id: p.pageId,
      source_url: p.url,
      municipality: 'Monroe',
      address: locationHint,
      manual_address: null,
      parcel_id: null,
      latitude: null,
      longitude: null,
      project_type: classifyProjectType({ description: p.description }),
      request_type: /rezoning/i.test(p.description) ? 'Rezoning' : null,
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
      status: null,
      description: p.description,
      last_action_date: null,
      hearing_date: null,
    }
  })

  console.log(`Parsed ${records.length} Monroe records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
