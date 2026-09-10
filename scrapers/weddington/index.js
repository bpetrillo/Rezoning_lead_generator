/**
 * Town of Weddington, NC — Development Projects and Subdivisions scraper. Union
 * County — second scraper added for this county after it was already marked
 * complete, since this town wasn't covered by the original 3 (Monroe, Indian Trail,
 * Waxhaw).
 *
 * Confirmed live: a single page (townofweddington.com/development-projects-and-
 * subdivisions) has a genuinely comprehensive real table — 59 real rows going back
 * to 2017 — one of the richest single sources found in this entire project. Columns:
 * Project Name, Project Type, Location, Plans (document links, not scraped —
 * outside this project's scope), Approval Date. Real addresses for most rows (e.g.
 * "3832 Twelve Mile Creek Rd", "5210 Weddington Road"), though some are
 * intersection/descriptive locations ("NW Corner Providence and Rea Road
 * Intersection") rather than a street address, consistent with the honest
 * geocoding-limitation pattern already seen elsewhere in this project.
 *
 * Each cell wraps its content in one or more `<p>` tags (confirmed live via direct
 * DOM inspection) except the Approval Date cell, which is sometimes plain text with
 * no wrapping tag at all — handled uniformly by stripping all inner tags from each
 * `<td>` rather than depending on the exact wrapper structure.
 *
 * HONEST LIMITATIONS:
 *   - The same project name can appear multiple times across different rows,
 *     representing different real stages of that project over time (e.g. "Weddington
 *     Glen" has both a 2021 Preliminary Plat row and a 2022 Conditional Zoning
 *     Amendment row) — each becomes its own record here rather than being merged,
 *     since they're genuinely separate real actions.
 *   - No case/petition number exists in this data at all — source_id is built from
 *     the project name plus its row position, which is stable across re-scrapes as
 *     long as the town doesn't reorder the table.
 *   - "Plans" (the actual document links) are not captured — out of scope for this
 *     project, consistent with how every other town's scraper handles attachments.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://www.townofweddington.com/development-projects-and-subdivisions'

function cellText(tdHtml) {
  const text = decodeHtmlEntities(tdHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text || null
}

async function fetchProjects() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`)
  const html = await res.text()

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) throw new Error('Could not find the projects table.')
  const tableHtml = tableMatch[1]

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  const projects = []
  let rowMatch
  let rowIndex = 0
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cellMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    if (cellMatches.length < 3) continue
    const name = cellText(cellMatches[0][1])
    if (!name || /^project name$/i.test(name)) continue
    const projectType = cellText(cellMatches[1][1])
    const location = cellMatches.length > 2 ? cellText(cellMatches[2][1]) : null
    const approvalDate = cellMatches.length > 4 ? cellText(cellMatches[4][1]) : null

    projects.push({ name, projectType, location, approvalDate, rowIndex })
    rowIndex++
  }
  return projects
}

function normalizeApprovalDate(dateText) {
  if (!dateText) return null
  const match = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null
  const [, month, day, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

async function main() {
  const projects = await fetchProjects()
  console.log(`Found ${projects.length} Weddington development projects.`)

  const records = projects.map((p) => {
    const approvalDate = normalizeApprovalDate(p.approvalDate)
    return {
      name: p.name,
      source: 'weddington',
      source_id: `${p.name}-${p.rowIndex}`,
      source_url: PAGE_URL,
      municipality: 'Weddington',
      address: p.location,
      manual_address: null,
      parcel_id: null,
      latitude: null,
      longitude: null,
      project_type: classifyProjectType({ description: `${p.name} ${p.projectType || ''}` }),
      request_type: p.projectType,
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
      status: approvalDate ? `Approved ${approvalDate}` : p.projectType,
      description: `${p.projectType || 'Project'} at ${p.location || 'an unspecified location'}.`,
      last_action_date: approvalDate,
      hearing_date: null,
    }
  })

  console.log(`Parsed ${records.length} Weddington records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
