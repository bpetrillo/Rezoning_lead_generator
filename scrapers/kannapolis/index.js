/**
 * City of Kannapolis, NC — Zoning Map Amendment scraper. Cabarrus County, via the
 * shared Cabarrus County Accela Citizen Access portal (also covers Concord, Harrisburg,
 * Mt Pleasant, Midland, Locust — a potential source for those towns too, not built yet).
 *
 * Verified live on 2026-08-25:
 *   Search: https://aca-prod.accela.com/cabarrus/Cap/CapHome.aspx?module=Planning&TabName=Planning&TabList=Home
 *   Detail: https://aca-prod.accela.com/CABARRUS/Cap/CapDetail.aspx?Module=Planning&...
 *
 * HYBRID APPROACH — genuinely different from every other scraper in this project:
 *   - The SEARCH step is an ASP.NET WebForms postback (selecting "KN_Zoning Map
 *     Amendment" from a dropdown and clicking Search triggers a postback, not a
 *     navigable URL) — confirmed live this can't be replicated with plain `fetch`
 *     (ASP.NET viewstate/eventvalidation tokens make direct POST replication fragile).
 *     Playwright drives this part: select the record type, click Search, then click
 *     through pagination, harvesting each result row's detail-page link along the way.
 *   - DETAIL pages, once you have their URL, are plain GET-able — confirmed live via
 *     fetch with no session/cookies at all. Once Playwright hands off the list of
 *     detail URLs, everything else uses fast plain fetch, not a browser.
 *
 * DATA SHAPE — different from Concord: no description text, no acreage, no applicant
 * name. But it DOES include a real owner name AND owner mailing address directly on
 * the page — confirmed live — which is valuable and normally needs separate GIS
 * enrichment (like Mecklenburg County's Polaris) to get.
 *
 * SCALE: only 15 total Kannapolis "KN_Zoning Map Amendment" records as of writing —
 * confirmed live ("Showing 1-10 of 15"). A small, real number, not an error.
 */

import { upsertProjects } from '../lib/upsert.js'
import { geocodeRecords } from '../lib/geocode.js'
import { classifyProjectType } from '../lib/classify.js'
import { chromium } from 'playwright'
import * as cheerio from 'cheerio'

const SEARCH_URL =
  'https://aca-prod.accela.com/cabarrus/Cap/CapHome.aspx?module=Planning&TabName=Planning&TabList=Home'

/** Uses a real browser to run the search (postback-based, can't be done with plain
 * fetch — see file header) and harvests every result row's detail-page URL across all
 * pages of results. */
async function collectDetailUrls(page) {
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Select "KN_Zoning Map Amendment" from the Record Type dropdown, then click Search.
  await page.evaluate(() => {
    const select = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.text.includes('KN_Zoning Map Amendment'))
    )
    select.value = Array.from(select.options).find((o) => o.text.includes('KN_Zoning Map Amendment')).value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.click('#ctl00_PlaceHolderMain_btnNewSearch')
  await page.waitForTimeout(2500)

  const urls = new Set()
  let hasNextPage = true
  let pageCount = 0

  while (hasNextPage && pageCount < 20) {
    // Guard against an infinite loop if the page structure ever changes — 20 pages
    // (200 records) is far more than the confirmed 15 total, so this never triggers
    // under normal conditions.
    pageCount++

    const pageUrls = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a')).filter((a) => /^KN-Z-\d{4}-\d+$/.test(a.textContent.trim()))
      return links.map((a) => a.href)
    })
    for (const url of pageUrls) urls.add(url)

    hasNextPage = await page.evaluate(() => {
      const nextLink = Array.from(document.querySelectorAll('a')).find((a) => a.textContent.trim() === 'Next >')
      if (!nextLink) return false
      nextLink.click()
      return true
    })
    if (hasNextPage) await page.waitForTimeout(2000)
  }

  return Array.from(urls)
}

async function fetchDetail(url) {
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  detail fetch failed (${res.status}): ${url}`)
    return null
  }
  const html = await res.text()
  const $ = cheerio.load(html)

  // Uses stable element IDs confirmed live against real record pages — NOT regex on
  // flattened page text. That approach was tried first and genuinely broke: the raw
  // HTML has a lot of hidden/non-visible content between labels (form widgets, ARIA
  // scaffolding) that doesn't show up in a browser's rendered text, so "everything
  // between label X and label Y" matched hundreds of characters of noise instead of
  // the actual short field value. Targeting specific elements is far more reliable.
  const recordNumber = $('#ctl00_PlaceHolderMain_lblPermitNumber').text().trim() || null
  if (!recordNumber) {
    // Diagnostic output — helps pin down exactly what's different about the real
    // fetched page vs. what was confirmed working in testing, instead of guessing.
    console.warn(`  no record number found for ${url}`)
    console.warn(`    response length: ${html.length}`)
    console.warn(`    page title: ${$('title').text().trim().slice(0, 100)}`)
    console.warn(`    contains 'lblPermitNumber' string: ${html.includes('lblPermitNumber')}`)
    console.warn(`    contains 'Access Denied' or 'Error': ${/access denied|error occurred|session/i.test(html)}`)
    return null
  }

  const statusRaw = $('#ctl00_PlaceHolderMain_divRecordStatus').text().trim()
  const status = statusRaw.replace(/^Record Status:?\s*/i, '').trim() || null

  const address = $('#divWorkLocationInfo').text().trim().replace(/\*$/, '').trim() || null

  // Owner label's ID has a per-record random numeric suffix — confirmed live, so this
  // matches by partial ID instead of an exact hardcoded one. The label element's
  // CONTAINING <td> holds the label text AND the value together; the sibling cells in
  // the same <tr> may be empty spacer cells, so this picks the first cell with
  // substantial text rather than assuming a fixed cell position.
  const ownerLabelEl = $('[id*="_label_owner"]').first()
  const row = ownerLabelEl.closest('tr')
  let ownerName = null
  let ownerMailingAddress = null
  if (row.length) {
    const ownerCell = row
      .find('td')
      .toArray()
      .map((td) => $(td))
      .find((td) => td.text().trim().length > 10)
    if (ownerCell) {
      const ownerRaw = ownerCell.text().trim().replace(/^Owner:?\s*/i, '').trim()
      // Owner text is "NAME * STREET CITY STATE ZIP" — split on the "*" marker that
      // consistently follows the name, confirmed live.
      const parts = ownerRaw.split('*')
      ownerName = parts[0]?.trim() || null
      ownerMailingAddress = parts[1]?.trim() || null
    }
  }

  return {
    name: address || recordNumber,
    source: 'kannapolis',
    source_id: recordNumber,
    source_url: url,
    municipality: 'Kannapolis',
    address,
    manual_address: null,
    parcel_id: null,
    latitude: null,
    longitude: null,
    project_type: classifyProjectType({ description: address }),
    request_type: 'Rezoning',
    current_zoning: null,
    zoning: null,
    acreage: null,
    applicant: ownerName,
    developer: null,
    owner: ownerName,
    owner_mailing_address: ownerMailingAddress,
    contact_email: null,
    contact_phone: null,
    manual_contact_email: null,
    manual_contact_phone: null,
    status,
    description: null,
    last_action_date: null,
    hearing_date: null,
  }
}

async function main() {
  const browser = await chromium.launch()
  let detailUrls = []
  try {
    const page = await browser.newPage()
    detailUrls = await collectDetailUrls(page)
  } finally {
    await browser.close()
  }
  console.log(`Found ${detailUrls.length} Kannapolis Zoning Map Amendment records.`)
  if (detailUrls.length > 0) {
    console.log(`  sample URL: ${detailUrls[0]}`)
  }

  const records = []
  for (const url of detailUrls) {
    const record = await fetchDetail(url)
    if (record) records.push(record)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log(`Parsed ${records.length} Kannapolis records.`)

  await geocodeRecords(records)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
