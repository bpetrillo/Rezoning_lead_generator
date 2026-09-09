/**
 * City of Tega Cay, SC — Residential Developments scraper. York County, SC.
 *
 * Genuinely different data shape from anything else in this project: Tega Cay
 * publishes a single-page PDF table ("Tega Cay Residential Developments with
 * Remaining Dwelling Units") tracking build-out progress for each active residential
 * development — Status, Development Name, Total Units Approved, CO's (Issued/
 * Remaining), Permits (Issued/Remaining), Projected Completion. Confirmed live: only
 * 6 real developments (much thinner than most towns), but the table is small, clean,
 * and appears to be actively maintained (auto-updates monthly under the same document
 * ID — the link text says "March-2026" but resolves to the September 2026 version).
 *
 * THE REAL CHALLENGE, confirmed against the actual uploaded PDF: pdf-parse extracts
 * this table with ZERO delimiters between adjacent numeric columns — e.g. "The
 * Grove375037503752030" is actually 6 separate values (name="The Grove", totalUnits=
 * 375, coIssued=0, coRemaining=375, permitsIssued=0, permitsRemaining=375,
 * completion=2030) all run together with no spaces at all.
 *
 * THE FIX: the data itself has a built-in arithmetic constraint that makes it
 * possible to correctly split — coRemaining = totalUnits − coIssued, and
 * permitsRemaining = totalUnits − permitsIssued. splitFiveNumbers() below brute-forces
 * every plausible split point and picks the one where both relationships hold true.
 * Verified against all 6 real rows in the actual uploaded PDF — every one splits
 * correctly, including the two "N/A" completion rows (Serenity Point, Windhaven).
 *
 * HONEST LIMITATIONS:
 *   - No address, parcel, applicant, or acreage data at all in this table — none of
 *     that is provided by this source. No geocoding is possible for any of these
 *     records as a result.
 *   - This tracks development BUILD-OUT progress (units built vs. remaining), not
 *     specifically rezoning case status — same broader "development activity" scope
 *     already used for Harrisburg and Monroe.
 */

import { upsertProjects } from '../lib/upsert.js'
import { classifyProjectType } from '../lib/classify.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const ACTIVE_DEVELOPMENTS_PAGE = 'https://www.tegacaysc.org/1393/Active-Developments'

function splitFiveNumbers(digits) {
  const n = digits.length
  for (let la = 1; la <= 4; la++) {
    const a = digits.slice(0, la)
    if (a.length > 1 && a[0] === '0') continue
    const totalUnits = parseInt(a, 10)
    for (let lb = 1; lb <= 4; lb++) {
      const bEnd = la + lb
      if (bEnd > n) break
      const b = digits.slice(la, bEnd)
      if (b.length > 1 && b[0] === '0') continue
      const coIssued = parseInt(b, 10)
      if (coIssued > totalUnits) continue
      const coRemaining = totalUnits - coIssued
      const cStr = String(coRemaining)
      const cEnd = bEnd + cStr.length
      if (cEnd > n || digits.slice(bEnd, cEnd) !== cStr) continue
      const rest = digits.slice(cEnd)
      for (let ld = 1; ld <= 4; ld++) {
        if (ld > rest.length) break
        const d = rest.slice(0, ld)
        if (d.length > 1 && d[0] === '0') continue
        const permitsIssued = parseInt(d, 10)
        if (permitsIssued > totalUnits) continue
        const permitsRemaining = totalUnits - permitsIssued
        if (rest.slice(ld) === String(permitsRemaining)) {
          return { totalUnits, coIssued, coRemaining, permitsIssued, permitsRemaining }
        }
      }
    }
  }
  return null
}

async function findReportUrl() {
  const res = await fetch(ACTIVE_DEVELOPMENTS_PAGE)
  if (!res.ok) throw new Error(`Active Developments page fetch failed: ${res.status}`)
  const html = await res.text()
  const match = html.match(/href="([^"]*DocumentCenter\/View\/\d+\/Tega-Cay-Residential-Developments[^"]*)"/i)
  if (!match) throw new Error('Could not find the Residential Developments report link.')
  return match[1]
}

function parseRows(text) {
  const rowRegex = /^(.+?Approved)([A-Za-z][A-Za-z\s]*?)\s*(\d+)(N\/A|\d{4})$/gm
  const rows = []
  let match
  while ((match = rowRegex.exec(text)) !== null) {
    const status = match[1].trim()
    const name = match[2].trim()
    const numbers = splitFiveNumbers(match[3])
    const completion = match[4]
    if (!numbers) {
      console.warn(`  could not split numbers for "${name}" — skipping`)
      continue
    }
    rows.push({ status, name, completion, ...numbers })
  }
  return rows
}

async function main() {
  const reportUrl = await findReportUrl()
  console.log(`Using report: ${reportUrl}`)

  const res = await fetch(reportUrl)
  if (!res.ok) throw new Error(`Report fetch failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const data = await pdfParse(buffer)

  const rows = parseRows(data.text)
  console.log(`Found ${rows.length} Tega Cay residential developments.`)

  const records = rows.map((r) => {
    const description = `${r.totalUnits} total units approved. ${r.coRemaining} of ${r.totalUnits} units remaining to reach Certificate of Occupancy (${r.coIssued} issued). ${r.permitsRemaining} of ${r.totalUnits} remaining for building permits (${r.permitsIssued} issued). Projected completion: ${r.completion}.`
    return {
      name: r.name,
      source: 'tega_cay',
      source_id: r.name,
      source_url: reportUrl,
      municipality: 'Tega Cay',
      address: null,
      manual_address: null,
      parcel_id: null,
      latitude: null,
      longitude: null,
      project_type: classifyProjectType({ description: `${r.name} residential subdivision homes` }),
      request_type: null,
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
      status: r.status,
      description,
      last_action_date: null,
      hearing_date: null,
    }
  })

  console.log(`Parsed ${records.length} Tega Cay records.`)
  await upsertProjects(records)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
