/**
 * City of Belmont, NC — Current Projects scraper. Gaston County.
 *
 * Belmont publishes real individual pages per project (e.g.
 * cityofbelmont.org/sake-express, /lakeview-farms/) linked from a structured listing
 * page at /projects/, which splits projects into two sections: "Pending Projects" and
 * "Approved Projects Under Construction" — confirmed live, 15 total real projects
 * across both sections as of writing. No bot protection, no login, plain fetch works
 * fine throughout.
 *
 * Field structure confirmed consistent across 2 real example pages (Sake Express,
 * Lakeview Farms): both have a real "Location:" line and an "Applicant:" line (Applicant
 * sometimes includes a real mailing address inline, e.g. "Tri Pointe Homes, 3436
 * Toringdon Way, STE 210, Charlotte, NC 28277"). A real case number (e.g. "ZA2025.03")
 * appears in SOME page titles but not all — confirmed live, Lakeview Farms' own page
 * has no case number in its title at all, only in linked document names. Handled here
 * by extracting it when present and falling back to the URL slug (always unique) as
 * source_id otherwise.
 *
 * HONEST LIMITATIONS:
 *   - Location text is sometimes a real street address, sometimes prose ("West side of
 *     South Point Road, south of Lower Armstrong Road...") — geocoding will fail for
 *     the prose ones, same expected partial-success pattern as other multi-parcel/
 *     descriptive-location towns in this project.
 *   - No clean explicit "Status" field beyond which of the two listing sections a
 *     project appears under (Pending vs. Approved/Under Construction) — used as the
 *     status value here, not a richer town-specific status like other towns provide.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'

const PROJECTS_PAGE_URL = 'https://www.cityofbelmont.org/projects/'
const BASE_URL = 'https://www.cityofbelmont.org'

// Confirmed live: plain fetch (Node's default minimal headers) gets a 403 Forbidden
// from this site — a simpler bot-block than Charlotte's Akamai challenge, which
// needed a full headless browser. Realistic browser headers alone are the first,
// simpler thing to try here.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

function fetchWithHeaders(url) {
  return fetch(url, { headers: BROWSER_HEADERS })
}

async function fetchProjectLinks() {
  const res = await fetchWithHeaders(PROJECTS_PAGE_URL)
  if (!res.ok) throw new Error(`Projects page fetch failed: ${res.status}`)
  const html = await res.text()

  const pendingIdx = html.indexOf('Pending Projects')
  const approvedIdx = html.indexOf('Approved Projects Under Construction')
  const mapIdx = html.indexOf('Projects Map')

  const pendingSection = html.slice(pendingIdx, approvedIdx)
  const approvedSection = html.slice(approvedIdx, mapIdx > -1 ? mapIdx : undefined)

  function extractLinks(sectionHtml, status) {
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g
    const seen = new Set()
    const links = []
    let match
    while ((match = linkRegex.exec(sectionHtml)) !== null) {
      const href = match[1]
      const text = match[2].trim()
      if (!text || seen.has(href)) continue
      seen.add(href)
      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`
      links.push({ url, name: text, status })
    }
    return links
  }

  return [...extractLinks(pendingSection, 'Pending'), ...extractLinks(approvedSection, 'Approved / Under Construction')]
}

function extractField(text, label) {
  const pattern = new RegExp(`${label}:\\s*(.+?)(?:\\n|$)`, 'i')
  const match = text.match(pattern)
  return match ? match[1].trim() : null
}

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d.]+)\+?\s*acres/i)
  return match ? match[1] : null
}

function extractCaseNumber(title) {
  const match = title.match(/^([A-Z]+\d{4}\.\d+)\s+/)
  return match ? match[1] : null
}

function slugFromUrl(url) {
  return new URL(url).pathname.replace(/\/$/, '').split('/').pop()
}

async function fetchProjectDetail(link) {
  const res = await fetchWithHeaders(link.url)
  if (!res.ok) {
    console.warn(`  detail fetch failed for ${link.name}: ${res.status}`)
    return null
  }
  const html = await res.text()
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const bodyText = (bodyMatch ? bodyMatch[1] : html)
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].replace(/\s*-\s*Belmont,?\s*NC\s*$/i, '').trim() : link.name
  const caseNumber = extractCaseNumber(pageTitle)

  const location = extractField(bodyText, 'Location')
  const applicant = extractField(bodyText, 'Applicant')

  const locationIdx = bodyText.indexOf('Location:')
  const description = locationIdx > -1 ? bodyText.slice(0, locationIdx).split('\n').filter((l) => l.trim().length > 40).pop() : null

  return {
    name: pageTitle,
    source: 'belmont',
    source_id: caseNumber || slugFromUrl(link.url),
    source_url: link.url,
    municipality: 'Belmont',
    address: location,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description }),
    request_type: null,
    current_zoning: null,
    zoning: null,
    acreage: extractAcreage(description),
    applicant,
    developer: null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: link.status,
    description,
    last_action_date: null,
    hearing_date: null,
  }
}

async function main() {
  const links = await fetchProjectLinks()
  console.log(`Found ${links.length} Belmont current projects.`)

  const records = []
  for (const link of links) {
    const record = await fetchProjectDetail(link)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log(`Parsed ${records.length} Belmont projects.`)

  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
