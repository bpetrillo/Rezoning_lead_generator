/**
 * Town of Cornelius — Development Projects scraper.
 *
 * Verified live on 2026-08-13 against:
 *   https://www.cornelius.org/government/departments/planning_/projects/development_projects/
 *
 * Structure: a nested nav menu with three status categories, each itself a page
 * (construction.php, approved.php, proposed.php) with individual project pages nested
 * as children (32 total as of writing: 12 Under Construction, 16 Approved, 4 Proposed).
 * Status is inferred from position in the nav tree relative to those three category
 * links — there's no status field printed on the individual project pages themselves
 * for pending ones (only approved ones show an explicit "Approval Date").
 *
 * Link discovery is scoped to `#flyout-wrap` (the sidebar project nav), not the whole
 * page — a page-wide search caught a footer "Login" link too, whose href happened to
 * contain a `ReturnUrl=` query param pointing back to this page, matching the
 * `includes('development_projects')` filter (confirmed live, then fixed).
 *
 * Like Huntersville, this covers development activity broadly (site plans, subdivision
 * amendments, etc.), not exclusively rezonings — but most carry a "(REZ NN-YY)" petition
 * number in the page title, which we extract when present.
 *
 * Each individual project page has a clean label/value <table> — same pattern as Mint
 * Hill — with: Applicant, Request, Acreage, Parcel(s), Location, Zoning, and either
 * "Approval Date" (approved projects) or nothing (pending ones, which instead list a
 * public meetings schedule elsewhere on the page that we don't parse).
 *
 * Real addresses are usually present (e.g. "20401 Zion Ave"), though a few — like the
 * Cornelius Inn case checked while researching this town — are "unaddressed parcel on
 * [road name]" instead, which won't geocode (confirmed live: the Census Geocoder
 * returns a clean empty match for these, not an error). No coordinates are present on
 * these pages directly, so geocoding via the US Census Geocoder API
 * (scrapers/lib/geocode.js) is wired in below for the addresses that do exist.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import * as cheerio from 'cheerio'

const LIST_URL = 'https://www.cornelius.org/government/departments/planning_/projects/development_projects/'
const BASE_URL = 'https://www.cornelius.org/'

const CATEGORY_LINK_NAMES = new Set(['Under Construction', 'Approved', 'Proposed'])

async function fetchProjectList() {
  const res = await fetch(LIST_URL)
  if (!res.ok) throw new Error(`Listing fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const items = []
  let currentStatus = null

  $('#flyout-wrap a').each((_, el) => {
    const text = $(el).text().trim()
    const href = $(el).attr('href')
    if (!href || !href.includes('development_projects') || !text) return

    if (CATEGORY_LINK_NAMES.has(text)) {
      currentStatus = text
      return
    }
    // Skip the category pages themselves and any non-project links picked up in the nav
    if (/\/(construction|approved|proposed)\.php$/.test(href)) return
    if (!href.endsWith('.php')) return

    items.push({
      name: text,
      status: currentStatus,
      url: href.startsWith('http') ? href : new URL(href, BASE_URL).toString(),
    })
  })

  return items
}

/** "Greenway Gartens (REZ 13-20)" -> "REZ 13-20" */
function extractCaseId(title) {
  const match = title.match(/\(([A-Z]+\s?\d+-\d+)\)/)
  return match ? match[1].replace(/\s+/g, ' ').trim() : null
}

function parseDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

async function fetchDetail(item) {
  const res = await fetch(item.url)
  if (!res.ok) {
    console.warn(`  detail fetch failed for ${item.name}: ${res.status}`)
    return null
  }
  const html = await res.text()
  const $ = cheerio.load(html)

  const pageTitle = $('title').text().trim() || item.name
  const caseId = extractCaseId(pageTitle)

  const fields = {}
  $('article table tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
      .get()
    if (cells.length >= 2) {
      const label = cells[0].replace(/:$/, '')
      fields[label] = cells.slice(1).join(' ').trim()
    }
  })

  return {
    name: item.name,
    source: 'cornelius',
    source_id: caseId || item.url.split('/').pop().replace('.php', ''),
    source_url: item.url,
    municipality: 'Cornelius',
    address: fields['Location'] || null,
    parcel_id: fields['Parcel(s)'] || null,
    latitude: null, // filled in by geocodeRecords() below, when address resolves
    longitude: null,
    // Cornelius's "Zoning" field is usually just the generic value "Conditional Zoning"
    // (confirmed live) — not a usable code — so classification here leans almost
    // entirely on the description/request text.
    project_type: classifyProjectType({ zoning: fields['Zoning'], description: fields['Request'] }),
    request_type: caseId ? 'Rezoning' : null, // only cases with a REZ number are
    // confirmed rezonings — other development project types (site plans, etc.) don't
    // get mislabeled
    zoning: fields['Zoning'] || null,
    applicant: fields['Applicant'] || null,
    developer: null,
    owner: null,
    status: item.status,
    description: fields['Request'] || null,
    last_action_date: parseDate(fields['Approval Date']),
    hearing_date: null,
  }
}

async function main() {
  const items = await fetchProjectList()
  console.log(`Found ${items.length} Cornelius development projects.`)
  const records = []
  for (const item of items) {
    const record = await fetchDetail(item)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log(`Parsed ${records.length} Cornelius projects.`)
  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
