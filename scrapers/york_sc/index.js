/**
 * City of York, SC — Subdivisions & Development Projects scraper. York County, SC.
 *
 * Confirmed live: a single page (yorksc.gov/planning-development/page/
 * subdivisions-development-projects) lists real subdivisions in up to 3 sections —
 * "Active/Approved", "Proposed/Pending", "Development Projects" (commercial/
 * industrial) — each an H2 heading followed by its own table. Confirmed live: only
 * "Active/Approved" has real content right now (19 real subdivisions), the other two
 * are currently empty, but this scrapes all 3 by section boundary so it picks up
 * anything added to them later without needing a code change.
 *
 * Each real row is 5 columns: Subdivision Name, # of Units, Type of Units, Site Plan
 * (link), Builder (link or plain "TBD" text). Confirmed live via real DOM inspection:
 * some subdivisions (e.g. "Fergus Crossroads") have MULTIPLE unit types, represented
 * as multiple `<p>` tags within the same # of Units / Type of Units cells (e.g. "243
 * Single-family homes", "110 Townhomes", "3 Commercial parcels" as 3 separate `<p>`
 * pairs, not 3 separate table rows) — handled by extracting each cell's `<p>` tags in
 * parallel and pairing them by index.
 *
 * BOT PROTECTION: confirmed live this site sits behind Cloudflare (Server: cloudflare,
 * a real cf-ray header present) — a plain fetch, even with realistic browser headers,
 * gets a 403 (headers alone aren't enough for Cloudflare's challenge, unlike Belmont's
 * simpler block). Uses Playwright here instead — same heavier approach already proven
 * for Charlotte and Matthews — since an actual browser can pass the challenge that a
 * plain HTTP client can't.
 *
 * HONEST LIMITATIONS:
 *   - No address, parcel, or acreage data at all — this table tracks unit counts and
 *     builders, not location or lot size. No geocoding is possible for these records.
 *   - "Status" reflects which of the 3 sections a subdivision appears under, not a
 *     specific rezoning case stage.
 */

import { chromium } from 'playwright'
import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://www.yorksc.gov/planning-development/page/subdivisions-development-projects'

const SECTIONS = ['Active/Approved', 'Proposed/Pending', 'Development Projects']

function extractCellParts(cellHtml) {
  const pMatches = [...cellHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
  if (pMatches.length > 0) {
    return pMatches.map((m) => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).trim()).filter(Boolean)
  }
  const text = decodeHtmlEntities(cellHtml.replace(/<[^>]+>/g, '')).trim()
  return text ? [text] : []
}

function parseSection(sectionHtml, status) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  const rows = []
  let rowMatch
  while ((rowMatch = rowRegex.exec(sectionHtml)) !== null) {
    const cellMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    if (cellMatches.length < 5) continue
    const [nameCell, unitsCell, typesCell, , builderCell] = cellMatches.map((m) => m[1])
    const name = decodeHtmlEntities(nameCell.replace(/<[^>]+>/g, '')).trim()
    if (!name) continue
    const units = extractCellParts(unitsCell)
    // Confirmed live: the table's own header row uses <td> cells instead of <th>, so
    // it otherwise passes every other check here — skip it by requiring at least one
    // real numeric unit count (the header row's cell is text like "# of Units", not a
    // number).
    if (units.length === 0 || !units.some((u) => /^\d+$/.test(u))) continue
    const types = extractCellParts(typesCell)
    const builder = decodeHtmlEntities(builderCell.replace(/<[^>]+>/g, '')).trim()

    const breakdown = units.map((u, i) => `${u} ${types[i] || ''}`.trim()).join(', ')
    const totalUnits = units.reduce((sum, u) => {
      const n = parseInt(u, 10)
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)

    rows.push({ name, breakdown, builder, totalUnits, status })
  }
  return rows
}

async function fetchPageHtml() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    // Confirmed live: the real subdivision table only appears once Cloudflare's
    // challenge has resolved — waiting for this specific heading is a reliable signal
    // that the real page (not a challenge/interstitial) has loaded.
    await page.waitForSelector('h2:has-text("Active/Approved")', { timeout: 15000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}

async function fetchSubdivisions() {
  const html = await fetchPageHtml()

  const headingPositions = SECTIONS.map((label) => {
    const pattern = new RegExp(`<h2[^>]*>\\s*${label.replace('/', '\\/')}\\s*<\\/h2>`, 'i')
    const match = html.match(pattern)
    return match ? { label, index: match.index } : null
  }).filter(Boolean)

  const allRows = []
  for (let i = 0; i < headingPositions.length; i++) {
    const { label, index } = headingPositions[i]
    const end = i + 1 < headingPositions.length ? headingPositions[i + 1].index : html.length
    const sectionHtml = html.slice(index, end)
    allRows.push(...parseSection(sectionHtml, label))
  }
  return allRows
}

async function main() {
  const subdivisions = await fetchSubdivisions()
  console.log(`Found ${subdivisions.length} York subdivisions/development projects.`)

  const records = subdivisions.map((s) => ({
    name: s.name,
    source: 'york_sc',
    source_id: s.name,
    source_url: PAGE_URL,
    municipality: 'York',
    address: null,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: s.breakdown }),
    request_type: null,
    current_zoning: null,
    zoning: null,
    acreage: null,
    applicant: s.builder !== 'TBD' ? s.builder : null,
    developer: s.builder !== 'TBD' ? s.builder : null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: s.status,
    description: `${s.totalUnits} total units: ${s.breakdown}.${s.builder !== 'TBD' ? ` Builder: ${s.builder}.` : ''}`,
    last_action_date: null,
    hearing_date: null,
  }))

  console.log(`Parsed ${records.length} York records.`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
