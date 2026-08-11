/**
 * Town of Mint Hill — Rezoning Files scraper.
 *
 * Verified live on 2026-08-11 by inspecting the actual page DOM. Structure:
 *   https://www.minthill.com/departments/planning_zoning/development_activity/rezoning.php
 *
 *   .faq-category            one per year (heading = year, e.g. "2026")
 *     .faq-item               one per rezoning case
 *       .faq-question          accordion title button, e.g. "ZC26-6 DEFERRED Mint Hill Festival"
 *       .faq-answer table      label/value rows: File, Description, Applicant, [Location],
 *                               Acreage, [Lots], Parcel Number(s), Current Zoning,
 *                               Proposed Zoning, Status, Public Hearing Date,
 *                               Planning Board Date, Decision Date, Documents (links)
 *
 * Notes on the real data (confirmed, not guessed):
 *   - Most rows have no "Location"/address field — only a parcel number. Boardwalk's
 *     addresses were almost certainly reverse-geocoded from the parcel via county GIS.
 *     Same for lat/long: not present on this page at all. See geocode() below — currently
 *     a stub, needs to be pointed at Mecklenburg County's parcel lookup (Polaris3G) or a
 *     free geocoder against the parcel's address if we resolve one.
 *   - Older rows (2019-2021ish) sometimes have blank/generic accordion titles (e.g.
 *     "File # ZC19-9") — the table rows are still fully populated, so we parse the table,
 *     not the title, for structured fields. The title is only used as a fallback name.
 *   - Date fields are inconsistently formatted ("August 13, 2026" vs "Aug 13, 2020 7:00 pm"
 *     vs "Differed to February 21, 2022") — parseLooseDate() below handles the common
 *     cases and returns null rather than guessing when it can't parse confidently.
 */

import { upsertProjects } from '../lib/upsert.js'
import * as cheerio from 'cheerio'

const PAGE_URL = 'https://www.minthill.com/departments/planning_zoning/development_activity/rezoning.php'

function parseLooseDate(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/^Differed to\s*/i, '').trim()
  const d = new Date(cleaned)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Splits an accordion title like "ZC26-6 DEFERRED Mint Hill Festival" into
 * { fileId: "ZC26-6", statusFromTitle: "DEFERRED", nameFromTitle: "Mint Hill Festival" }.
 * Falls back gracefully for sparse older titles like "File # ZC19-9".
 */
function parseTitle(title) {
  const cleaned = title.replace(/^File\s*#\s*/i, '').trim()
  const match = cleaned.match(/^([A-Z]+\d+-\d+)\s*(.*)$/)
  if (!match) return { fileId: null, statusFromTitle: null, nameFromTitle: cleaned }
  const [, fileId, rest] = match
  // Known status words that show up in titles
  const statusMatch = rest.match(
    /^(APPROVED|DENIED|WITHDRAWN|DEFERRED|PENDING)\s*(.*)$/i
  )
  if (statusMatch) {
    return { fileId, statusFromTitle: statusMatch[1].toUpperCase(), nameFromTitle: statusMatch[2].trim() || null }
  }
  return { fileId, statusFromTitle: null, nameFromTitle: rest.trim() || null }
}

async function fetchAndParse() {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const records = []

  $('.faq-category').each((_, catEl) => {
    const year = $(catEl).find('h2, h3, .faq-category-title').first().text().trim()

    $(catEl)
      .find('.faq-item')
      .each((_, itemEl) => {
        const title = $(itemEl).find('.faq-question').first().text().replace(/\s+/g, ' ').trim()
        const { fileId, statusFromTitle, nameFromTitle } = parseTitle(title)

        const fields = {}
        $(itemEl)
          .find('table tr')
          .each((_, trEl) => {
            const cells = $(trEl)
              .find('td, th')
              .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
              .get()
            if (cells.length >= 2) {
              fields[cells[0]] = cells.slice(1).join(' ').trim()
            }
          })

        const documentLinks = $(itemEl)
          .find('table a')
          .map((_, a) => {
            const href = $(a).attr('href')
            if (!href) return null
            return href.startsWith('http') ? href : new URL(href, PAGE_URL).toString()
          })
          .get()
          .filter(Boolean)

        const fileNumber = fields['File'] || fileId
        if (!fileNumber) return // skip anything we can't uniquely key

        records.push({
          name: nameFromTitle || fields['Description']?.slice(0, 80) || fileNumber,
          source: 'mint_hill',
          source_id: fileNumber,
          source_url: documentLinks[0] || PAGE_URL,
          municipality: 'Mint Hill',
          address: fields['Location'] || null,
          parcel_id: fields['Parcel Number(s)'] || null,
          latitude: null, // TODO: geocode from parcel_id / address — see file header
          longitude: null,
          project_type: null, // not provided directly; could be inferred later from
          // Current/Proposed Zoning codes if we build a zoning-code → category mapping
          request_type: 'Rezoning',
          zoning: fields['Proposed Zoning'] || null,
          applicant: fields['Applicant'] || null,
          developer: null,
          owner: null,
          status: (fields['Status'] || statusFromTitle || '').trim() || null,
          description: fields['Description'] || null,
          last_action_date: parseLooseDate(fields['Decision Date']),
          hearing_date: parseLooseDate(fields['Public Hearing Date']),
          _year: year, // not part of the schema — kept for debugging/logging only
        })
      })
  })

  return records
}

async function main() {
  const records = await fetchAndParse()
  console.log(`Parsed ${records.length} Mint Hill rezoning cases.`)
  const cleanRecords = records.map(({ _year, ...r }) => r)
  await upsertProjects(cleanRecords)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
