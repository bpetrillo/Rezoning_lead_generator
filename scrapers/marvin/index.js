/**
 * Village of Marvin, NC — Rezoning Projects scraper. Union County.
 *
 * Confirmed live: a single page (marvinnc.gov/Government/Planning-Zoning/Projects/
 * Rezoning) lists real rezoning cases in a simple 2-column table (Project Name,
 * Status). Confirmed live: 10 real cases. The other project categories on this site
 * (Residential, Commercial, Special Use Permits, Annexations, Other Projects) were
 * checked and are genuinely empty — the site's own "under construction" notice
 * confirms this, not a scraping gap — so only Rezoning is covered here.
 *
 * Some project names embed a real address in parentheses (e.g. "CZ-2026-2 (9509 &
 * 9523 Marvin School Rd)") — extracted when present. Most don't (e.g. "Lett
 * Property", "ZMA 2025-3", "Marvin Grove Phase II") since this is genuinely all the
 * detail this small-town page provides.
 *
 * HONEST LIMITATIONS:
 *   - No case number is present for every entry, and there's no acreage, applicant,
 *     zoning transition, or date field at all — this is a very thin source. Only
 *     name, address (when embedded), and status are real.
 *   - This is a genuinely small town — 10 total cases is the real, current count,
 *     not a partial scrape.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://marvinnc.gov/Government/Planning-Zoning/Projects/Rezoning'

function extractAddress(name) {
  const match = name.match(/\(([^)]*\d[^)]*)\)/)
  return match ? match[1].trim() : null
}

async function fetchProjects() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`)
  const html = await res.text()

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) throw new Error('Could not find the rezoning projects table.')

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  const projects = []
  let rowMatch
  let rowIndex = 0
  while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
    const cellMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    if (cellMatches.length < 2) continue
    const name = decodeHtmlEntities(cellMatches[0][1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (!name || /^project name$/i.test(name)) continue
    const status = decodeHtmlEntities(cellMatches[1][1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

    projects.push({ name, status, address: extractAddress(name), rowIndex })
    rowIndex++
  }
  return projects
}

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Marvin rezoning projects.`)

  const records = projects.map((p) => ({
    name: p.name,
    source: 'marvin',
    source_id: `${p.name}-${p.rowIndex}`,
    source_url: PAGE_URL,
    municipality: 'Marvin',
    address: p.address,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: p.name }),
    request_type: 'Rezoning',
    current_zoning: null,
    zoning: null,
    acreage: null,
    applicant: null,
    developer: null,
    owner: null,
    owner_mailing_address: null,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status: p.status,
    description: null,
    last_action_date: null,
    hearing_date: null,
  }))

  console.log(`Parsed ${records.length} Marvin records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
