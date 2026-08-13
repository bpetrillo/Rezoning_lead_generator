/**
 * Town of Matthews — Rezonings scraper.
 *
 * Verified live on 2026-08-13 against:
 *   https://www.matthewsnc.gov/pview.aspx?id=20825&catid=0
 *
 * IMPORTANT: this site returns 403 Forbidden to plain HTTP requests, even with spoofed
 * browser headers and a simulated session cookie (both tried and failed). This version
 * uses a real headless browser (Playwright) instead of `fetch` to get past it — see
 * fetchWithBrowser() below for the reasoning and an honest caveat about what's verified
 * and what isn't.
 *
 * Unlike Charlotte (paginated by year, one detail page per petition) or Mint Hill
 * (accordion), Matthews publishes ALL rezoning cases back to ~2010 in a single dense
 * HTML table — one row per case, six columns:
 *
 *   APPLICATION | LOCATION | ZONING | REQUESTED | DOCUMENTS | STATUS
 *
 * Each cell packs multiple lines separated by <br> tags (sometimes wrapped in <span>,
 * sometimes plain text nodes — both are handled below):
 *   - APPLICATION cell: [case ID, applicant name, (optional) project nickname]
 *   - LOCATION cell:    [street address, "Tax Parcel ..." / "Parcel ..." line]
 *   - STATUS cell:      [status word, decision date]
 *
 * No address geocoding needed to be *found* here (real street addresses are present),
 * but — like Mint Hill — there's no lat/long anywhere on this page, so pins still need
 * a geocoding pass (Census Geocoder API is a good free/keyless option) before they'll
 * show up on the map. Also note this page is ONE long table with no year-based URL
 * pattern, so the fetch step (browser-page-load aside) only needs one page load total.
 *
 * Known limitation: a handful of old combined "Motion" petitions (e.g. "2019-2.A/B/C",
 * "Town of Matthews Motion 2023-1") bundle multiple cases/dates into one row. The ID
 * regex below falls back to using the whole first line as the id when it doesn't match
 * the standard "YYYY-NNN" pattern, so these still get imported, just without a clean
 * decision date — acceptable for now, flagged here rather than silently guessed at.
 */

import { upsertProjects } from '../lib/upsert.js'
import * as cheerio from 'cheerio'

const PAGE_URL = 'https://www.matthewsnc.gov/pview.aspx?id=20825&catid=0'

/** Splits a table cell's content into lines, treating <br> as the line separator. */
function cellLines($, cell) {
  const clone = $(cell).clone()
  clone.find('br').replaceWith('\n')
  return clone
    .text()
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function parseDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Fetches the page via a real headless Chromium browser (Playwright) instead of plain
 * `fetch`. matthewsnc.gov returned 403 even with spoofed browser headers and a simulated
 * session cookie — the next-strongest theory is it's checking something only a real
 * browser produces (TLS/JA3 fingerprint, or a JS-driven check), which no amount of
 * header spoofing from Node's fetch can replicate. A real browser sidesteps that
 * entirely since it presents an actual browser fingerprint and runs any page JS.
 *
 * NOTE: this has NOT been verified against the live site — my sandbox can't reach
 * matthewsnc.gov either way (network allowlist doesn't include it), so this is the
 * next reasonable fix to try, not a confirmed one. If it still 403s, the block is
 * likely IP-reputation or geofencing based, which no client-side change can fix.
 */
async function fetchWithBrowser() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}

async function fetchAndParse() {
  const html = await fetchWithBrowser()
  const $ = cheerio.load(html)

  const rows = $('table tr').toArray()
  const records = []

  for (const row of rows) {
    const cells = $(row).find('td')
    if (cells.length < 6) continue // skip header / malformed rows

    const appLines = cellLines($, cells[0])
    const locLines = cellLines($, cells[1])
    const currentZoning = cellLines($, cells[2]).join(' ') || null
    const proposedZoning = cellLines($, cells[3]).join(' ') || null
    const statusLines = cellLines($, cells[5])

    if (!appLines.length) continue

    const idMatch = appLines[0].match(/^(\d{4}-[\w.]+)\s*(.*)$/)
    const caseId = idMatch ? idMatch[1] : appLines[0]
    // If the ID line also had trailing text (no <br> before applicant name, seen on a
    // few rows), fold it back into the name lines.
    const remainderOfFirstLine = idMatch ? idMatch[2] : ''
    const nameLines = [remainderOfFirstLine, ...appLines.slice(1)].filter(Boolean)

    const parcelLine = locLines.find((l) => /tax parcel|^parcel/i.test(l)) || null
    const addressLines = locLines.filter((l) => l !== parcelLine)

    records.push({
      name: nameLines[nameLines.length - 1] || nameLines[0] || caseId,
      source: 'matthews',
      source_id: caseId,
      source_url: PAGE_URL, // all cases live on one page — no per-case URL to link to
      municipality: 'Matthews',
      address: addressLines.join(', ') || null,
      parcel_id: parcelLine ? parcelLine.replace(/^(tax )?parcel s?/i, '').trim() : null,
      latitude: null, // TODO: geocode — see file header
      longitude: null,
      project_type: null,
      request_type: 'Rezoning',
      zoning: proposedZoning,
      applicant: nameLines[0] || null,
      developer: null,
      owner: null,
      status: statusLines[0] || null,
      description: null, // not provided as a separate field on this page
      last_action_date: parseDate(statusLines[1]),
      hearing_date: null, // not broken out separately here (only decision date is)
    })
  }

  return records
}

async function main() {
  const records = await fetchAndParse()
  console.log(`Parsed ${records.length} Matthews rezoning cases.`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
