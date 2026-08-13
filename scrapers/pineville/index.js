/**
 * Town of Pineville — "Planning Projects, Meetings, and Events" scraper.
 *
 * THIN VERSION BY DESIGN. Verified live on 2026-08-13 against:
 *   https://www.pinevillenc.gov/planningmeetingsprojectsevents/
 *
 * Unlike Charlotte, Mint Hill, and Matthews, Pineville does not publish a structured
 * case list at all. This page is a manually-maintained bulletin organized into category
 * headings (h4), each followed by one <p> per project — plain prose with zero or more
 * links to PDFs. No case ID, no parcel number, no zoning code, no applicant name, no
 * formal date/status fields exist anywhere on this page.
 *
 * I also checked Pineville's Town Council meeting agendas (hosted on Municode) as a
 * richer alternative — those DO have "Conditional Zoning Request" items with attached
 * application/staff-report PDFs, but:
 *   (a) Municode's meeting list requires login — there's no public API to auto-discover
 *       new meeting URLs, only ones already indexed by search engines, so a scraper
 *       can't reliably find new meetings on its own, and
 *   (b) getting real structured fields out of those would mean parsing prose PDF text
 *       (staff reports), which is inherently lower-confidence than the labeled fields
 *       the other three towns' web pages provide directly.
 * Given that, this scraper intentionally stays thin rather than producing unreliable
 * structured data. What it captures: project name, category, and document links. It
 * does NOT set address, parcel_id, zoning, applicant, or dates — those are genuinely not
 * available here without the PDF-parsing effort described above.
 *
 * Categories seen on the live page (confirmed): "PROPOSED RESIDENTIAL DEVELOPMENT",
 * "NEW RESIDENTIAL DEVELOPMENT", "NEW COMMERCIAL DEVELOPMENT", "ROAD and SIDEWALK
 * PROJECTS", "Older Plans (ongoing construction)", "GENERAL INTEREST". Mapped to the
 * schema's project_type where a reasonable mapping exists; left null otherwise.
 */

import { upsertProjects } from '../lib/upsert.js'
import * as cheerio from 'cheerio'

const PAGE_URL = 'https://www.pinevillenc.gov/planningmeetingsprojectsevents/'

const CATEGORY_TO_PROJECT_TYPE = {
  'PROPOSED RESIDENTIAL DEVELOPMENT': 'Residential',
  'NEW RESIDENTIAL DEVELOPMENT': 'Residential',
  'NEW COMMERCIAL DEVELOPMENT': 'Commercial',
  'ROAD AND SIDEWALK PROJECTS': 'Infrastructure',
}

/** Turns free text into a short, stable, URL-safe id for upsert de-duping. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function fetchAndParse() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const root = $('.entry-content-wrapper')
  const records = []
  let currentCategory = null

  root.find('h2, h4, p').each((_, el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'h2' || tag === 'h4') {
      const text = $(el).text().replace(/:$/, '').trim()
      if (text) currentCategory = text
      return
    }
    // tag === 'p'
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (!text) return

    const links = $(el)
      .find('a')
      .map((_, a) => {
        const href = $(a).attr('href')
        return href ? (href.startsWith('http') ? href : new URL(href, PAGE_URL).toString()) : null
      })
      .get()
      .filter(Boolean)

    const categoryKey = (currentCategory || '').toUpperCase()

    records.push({
      name: text.slice(0, 200),
      source: 'pineville',
      source_id: slugify(`${currentCategory || 'uncategorized'}-${text}`),
      source_url: links[0] || PAGE_URL,
      municipality: 'Pineville',
      address: null, // not available — see file header
      parcel_id: null, // not available
      latitude: null,
      longitude: null,
      project_type: CATEGORY_TO_PROJECT_TYPE[categoryKey] || null,
      request_type: null, // often not actually a rezoning — could be a subdivision
      // proposal, road project, etc. Left null rather than mislabeling everything
      // "Rezoning" like the other towns' scrapers do.
      zoning: null,
      applicant: null,
      developer: null,
      owner: null,
      status: null, // status is sometimes embedded in the prose (e.g. "APPROVED") but
      // not reliably extractable — left null rather than guessed
      description: text,
      last_action_date: null,
      hearing_date: null,
    })
  })

  return records
}

async function main() {
  const records = await fetchAndParse()
  console.log(`Parsed ${records.length} Pineville planning items (thin — no structured fields).`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
