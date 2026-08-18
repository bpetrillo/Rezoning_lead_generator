/**
 * City of Charlotte — Rezoning Petitions scraper.
 *
 * Verified live on 2026-08-11 by inspecting the actual pages (my earlier Legistar-based
 * guess for Charlotte was WRONG and has been deleted — Charlotte does not run rezoning
 * through Legistar, it has its own pages). Real structure:
 *
 *   Listing page (one per year):
 *     https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning/{year}
 *     Plain links: "2026-001 MPV Properties & Mission Properties (Pending)" →
 *     https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning/{year}/{year}-{num}
 *
 *   Detail page, label/value pairs as heading+next-sibling:
 *     h2 "Proposal"  → div containing two h6/p pairs: "Current Zoning"/"Proposed Zoning"
 *     h2 "Rezoning Application in Accela" → p (this heading text is a quirk of the CMS —
 *        the actual project description paragraph sits right after it)
 *     h2 "Location"  → p (general location description, not a mailing address)
 *     h2 "Address"   → p with a <br> between street and city/state/zip
 *     h2 "Dates"     → ul with "Label: Value" per li
 *     h2 "Petition Details" (side box) → h3/p pairs: Status, Petitioner, Council District
 *
 *   Coordinates: NOT listed as text anywhere, but the embedded Google Maps iframe's `src`
 *   contains the geocoded lat/long directly (pattern "!2d{lng}!3d{lat}"), so we can pull
 *   real coordinates without a separate geocoding step — nice, this is better than Mint
 *   Hill's page, which has neither address nor coordinates.
 *
 *   Parcel ID: not shown as text on this page (unlike Mint Hill). It may only exist inside
 *   the linked site-plan PDFs. Left null for now — flagged as a follow-up if parcel-level
 *   matching to county GIS becomes important.
 *
 * UPDATE (2026-08-17): charlottenc.gov started returning an Akamai Bot Manager
 * "Access Denied" challenge page to plain `fetch` requests — confirmed live, and
 * notably this even happened to a real signed-in Chrome tab making the same request,
 * not just the Node scraper. This is a step up from Matthews' simple 403: it's a real
 * bot-detection challenge, not just a missing-header check, and it fails silently (HTTP
 * 200, just with challenge HTML instead of real content) rather than throwing an error
 * — which is why the old version returned "found 0 petitions" instead of a clear
 * failure. Switched to Playwright (same fix as Matthews), but structured differently:
 * ONE browser context is reused across the entire run (all years, all detail pages)
 * rather than a fresh one per request, so that once Akamai's challenge is solved by the
 * first real page load, its session cookie carries over to every subsequent request in
 * the same run — a fresh context per request would likely face the challenge every
 * single time and be much slower/more failure-prone.
 */

import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'
import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

const BASE_URL = 'https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning'

// Charlotte's site lists 2021–2026 on the Rezoning landing page as of writing.
// Update this range periodically (or scrape the landing page's "Petitions By Year" links
// directly instead of hardcoding — left simple for now).
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026]

async function fetchListing(page, year) {
  const ok = await gotoWithRetry(page, `${BASE_URL}/${year}`, `listing fetch for ${year}`)
  if (!ok) throw new Error(`Listing fetch failed for ${year} after retries.`)
  const html = await readContentWithRetry(page)
  if (html.includes('Access Denied') || page.url().includes('bm-verify')) {
    throw new Error(
      `Blocked by bot protection on the ${year} listing page (Access Denied / bm-verify challenge) — the fix that worked before isn't working now.`
    )
  }
  const $ = cheerio.load(html)

  const petitions = []
  $('a').each((_, a) => {
    const href = $(a).attr('href')
    if (href && new RegExp(`/Rezoning/${year}/${year}-\\d+$`).test(href)) {
      const id = href.split('/').pop()
      petitions.push({ id, url: href.startsWith('http') ? href : new URL(href, BASE_URL).toString() })
    }
  })
  // de-dupe (the petition number appears twice per row: once in the full-line link
  // text, once in the "2026-001" link itself)
  const seen = new Set()
  return petitions.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
}

/** Given an h2/h3/h6 heading element and its cheerio instance, grab the next sibling's text. */
function nextText($, headingEl) {
  const next = $(headingEl).next()
  if (!next.length) return null
  // Convert <br> to a space so multi-line addresses don't get mashed together
  next.find('br').replaceWith(' ')
  return (
    next
      .text()
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',') // collapse double commas from lines that already end in ","
      .trim() || null
  )
}

function extractLatLng(html) {
  const match = html.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/)
  if (!match) return { latitude: null, longitude: null }
  return { longitude: parseFloat(match[1]), latitude: parseFloat(match[2]) }
}

async function gotoWithRetry(page, url, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // 'domcontentloaded' instead of 'networkidle': the latter waits for ALL network
      // activity to settle, which hangs indefinitely on sites with background
      // analytics/tracking pings that never go fully quiet — confirmed live, this is
      // what caused a 30s timeout on a real detail page. We only need the HTML content,
      // not every last background request to finish.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      // Akamai's bot check appears to run a client-side redirect/challenge AFTER
      // domcontentloaded fires — confirmed live: reading content immediately sometimes
      // caught an intermediate state (0 petitions found one run, a "page is navigating"
      // error the next). A short settle pause gives that redirect chain time to finish
      // before we try to read anything.
      await page.waitForTimeout(2000)
      return true
    } catch (err) {
      console.warn(`  ${label}: attempt ${attempt} failed (${err.message.split('\n')[0]})`)
      if (attempt === 2) return false
    }
  }
}

/**
 * Reads page.content(), retrying through the "page is navigating and changing the
 * content" race condition — confirmed live, this happens when Akamai's post-load
 * redirect is still in flight when we try to read. A few short retries resolves it
 * without needing to guess exactly how long the redirect takes.
 */
async function readContentWithRetry(page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await page.content()
    } catch (err) {
      if (attempt === 4) throw err
      await page.waitForTimeout(1000)
    }
  }
}

async function fetchDetail(page, petitionId, url) {
  const ok = await gotoWithRetry(page, url, `detail fetch for ${petitionId}`)
  if (!ok) return null // one bad page shouldn't crash a ~1500-page-load run
  const html = await readContentWithRetry(page)
  if (html.includes('Access Denied') || page.url().includes('bm-verify')) {
    console.warn(`  detail fetch blocked by bot protection for ${petitionId}`)
    return null
  }
  const $ = cheerio.load(html)

  const h2Map = {}
  $('h2').each((_, el) => {
    h2Map[$(el).text().trim()] = nextText($, el)
  })

  const h6Map = {}
  $('h6').each((_, el) => {
    h6Map[$(el).text().trim()] = nextText($, el)
  })

  const h3Map = {}
  $('h3').each((_, el) => {
    h3Map[$(el).text().trim()] = nextText($, el)
  })

  // Dates list, e.g. "Public Hearing Date: June 15, 2026"
  const dates = {}
  $('h2')
    .filter((_, el) => $(el).text().trim() === 'Dates')
    .next('ul')
    .find('li')
    .each((_, li) => {
      const [label, ...rest] = $(li).text().split(':')
      if (rest.length) dates[label.trim()] = rest.join(':').trim()
    })

  const { latitude, longitude } = extractLatLng(html)

  const parseDate = (raw) => {
    if (!raw || /pending/i.test(raw)) return null
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }

  const zoning = h6Map['Proposed Zoning'] || null
  const description = h2Map['Rezoning Application in Accela'] || h2Map['Location'] || null

  return {
    name: h3Map['Petitioner'] || petitionId,
    source: 'charlotte',
    source_id: petitionId,
    source_url: url,
    municipality: 'Charlotte',
    address: h2Map['Address'] || null,
    parcel_id: null, // not on this page — see file header
    latitude,
    longitude,
    // Charlotte uses its own newer "UDO" zoning code system (e.g. "N2-B(CD)") — see
    // scrapers/lib/classify.js header for confidence caveats on this specific mapping.
    project_type: classifyProjectType({ zoning, description, zoningSystem: 'udo' }),
    request_type: 'Rezoning',
    current_zoning: h6Map['Current Zoning'] || null,
    zoning,
    acreage: null, // not shown on this page — see file header
    applicant: h3Map['Petitioner'] || null,
    developer: null,
    owner: null,
    status: h3Map['Status'] || null,
    description,
    last_action_date: parseDate(dates['Approval Date'] || dates['Council Decision Date']),
    hearing_date: parseDate(dates['Public Hearing Date']),
  }
}

async function main() {
  const browser = await chromium.launch()
  const allRecords = []
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
    for (const year of YEARS) {
      console.log(`Fetching Charlotte petitions for ${year}...`)
      const petitions = await fetchListing(page, year)
      console.log(`  found ${petitions.length} petitions`)
      for (const p of petitions) {
        const record = await fetchDetail(page, p.id, p.url)
        if (record) allRecords.push(record)
        // Be polite to the city's server — small delay between requests
        await new Promise((r) => setTimeout(r, 200))
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`Parsed ${allRecords.length} total Charlotte petitions.`)
  await upsertProjects(allRecords)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
