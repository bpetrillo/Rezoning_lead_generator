/**
 * Town of Waxhaw, NC — Developer Projects scraper. Union County.
 *
 * Confirmed live: a single page (waxhaw.com/government/departments/planning/
 * developer-projects-update) is genuinely the richest source found in this entire
 * project. Active projects are accordion items (`class='accordion-item'`), each with
 * real labeled fields in `<p><strong>Label:</strong> value</p>` form — Process
 * (often includes a real permit/case number in parentheses, e.g. "(SUB-015444-2024)"),
 * Location (a real address for most), Description, and Applicant/Owner (a real
 * name). Each item also has a numbered stage list (Approval Status and/or
 * Construction Status) with the current stage marked "- CURRENT STAGE" — used here as
 * the status value. Confirmed live: 29 real active projects.
 *
 * A separate "Completed Projects" section is a plain 2-column table (Name,
 * Description only — no location/applicant/status) for projects with build-out
 * finished. Confirmed live: 18 real completed projects, included with status
 * "Completed" and no address (none is given for this section).
 *
 * HONEST LIMITATIONS:
 *   - Completed projects have no address, applicant, or case number — only a name
 *     and description, since that's genuinely all this section provides.
 *   - "Current stage" reflects whichever numbered list's current-stage marker appears
 *     LAST in the item (Construction Status generally follows Approval Status when
 *     both are present) — a reasonable proxy for overall progress, not a single
 *     unambiguous status field.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { decodeHtmlEntities } from '../lib/html.js'

const PAGE_URL = 'https://www.waxhaw.com/government/departments/planning/developer-projects-update'

function extractField(itemHtml, label) {
  const pattern = new RegExp(`<strong>${label}:?[^<]*<\\/strong>\\s*([\\s\\S]*?)<\\/p>`, 'i')
  const match = itemHtml.match(pattern)
  if (!match) return null
  const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  return text || null
}

function extractCaseNumber(processText) {
  if (!processText) return null
  const match = processText.match(/\(([A-Z]+-\d+-\d{4})\)/)
  return match ? match[1] : null
}

function extractCurrentStage(itemHtml) {
  const matches = [...itemHtml.matchAll(/<li><strong>([^<]+?)\s*-\s*CURRENT STAGE<\/strong><\/li>/gi)]
  if (matches.length === 0) return null
  return decodeHtmlEntities(matches[matches.length - 1][1]).trim()
}

function extractAcreage(text) {
  if (!text) return null
  const match = text.match(/([\d.]+)\s*acres/i)
  return match ? match[1] : null
}

async function fetchActiveProjects(html) {
  const items = html.split(`class='accordion-item'`).slice(1)
  const projects = []
  for (const itemHtml of items) {
    const titleMatch = itemHtml.match(/class='title'>([^<]+)<\/div>/)
    if (!titleMatch) continue
    const name = titleMatch[1].trim()
    const process = extractField(itemHtml, 'Process')
    const location = extractField(itemHtml, 'Location')
    const description = extractField(itemHtml, 'Description')
    // Confirmed live: 2 of the 29 accordion items are the page's own "How To Use This
    // Page" and "Terms and Definitions" informational sections, not real projects —
    // they share the same CSS class but have no Location or Description field at all.
    if (!location && !description) continue

    const applicant = extractField(itemHtml, 'Applicant\\/Owner')
    const caseNumber = extractCaseNumber(process)
    const currentStage = extractCurrentStage(itemHtml)

    projects.push({
      name,
      source_id: caseNumber || name,
      address: location,
      description,
      applicant,
      status: currentStage,
      isCompleted: false,
    })
  }
  return projects
}

function fetchCompletedProjects(html) {
  const idx = html.indexOf('Completed Projects')
  if (idx === -1) return []
  const section = html.slice(idx)
  const rowRegex = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g
  const projects = []
  let match
  while ((match = rowRegex.exec(section)) !== null) {
    const name = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    const description = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (!name || /project name/i.test(name)) continue
    projects.push({
      name,
      source_id: name,
      address: null,
      description,
      applicant: null,
      status: 'Completed',
      isCompleted: true,
    })
  }
  return projects
}

async function main() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`)
  const html = await res.text()

  const activeProjects = await fetchActiveProjects(html)
  const completedProjects = fetchCompletedProjects(html)
  const allProjects = [...activeProjects, ...completedProjects]
  console.log(`Found ${activeProjects.length} active + ${completedProjects.length} completed Waxhaw projects.`)

  const records = allProjects.map((p) => ({
    name: p.name,
    source: 'waxhaw',
    source_id: p.source_id,
    source_url: PAGE_URL,
    municipality: 'Waxhaw',
    address: p.address,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: p.description }),
    request_type: /rezoning/i.test(p.description || '') ? 'Rezoning' : null,
    current_zoning: null,
    zoning: null,
    acreage: extractAcreage(p.description),
    applicant: p.applicant,
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
  }))

  console.log(`Parsed ${records.length} Waxhaw records.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
