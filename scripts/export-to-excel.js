/**
 * Exports the FULL current contents of the rezoning_projects table to a formatted
 * Excel file — a backup snapshot, independent of Supabase, so the data isn't only
 * living in one place.
 *
 * This is a full snapshot every time, not an incremental "just the new stuff" export —
 * every row currently in the table, overwriting the previous backup file. That's
 * intentional: it means the .xlsx always reflects the current true state (including
 * edits like your lead tracking and manual contact entries), and if this gets committed
 * to git (see the GitHub Actions workflow), you automatically get a full historical
 * version of the ENTIRE dataset preserved in git history every single day it runs —
 * real protection against losing data, not just a single point-in-time copy that itself
 * could be lost.
 *
 * Supabase caps a single query at 1000 rows by default — with ~1400+ rows across all
 * 7 towns as of writing, this paginates through in batches of 1000 until everything's
 * fetched, rather than silently truncating at 1000.
 *
 * LAYOUT NOTES (2026-08-22 rework — readability + clean Power BI import):
 *   - Added computed "Email"/"Phone"/"Address" columns (manual override if present,
 *     else whatever was auto-detected) right near the front, so a quick glance gives
 *     the real answer without needing to check two columns and compare — the separate
 *     "(auto)"/"(manual)" source columns still exist further along for anyone (or any
 *     BI report) that wants to distinguish where a value came from.
 *   - Date columns now get REAL Excel date values (not text) — confirmed via a direct
 *     test that this makes Power BI (and Excel itself) treat them as true Date-typed
 *     columns automatically, usable in date hierarchies/slicers without a manual
 *     conversion step on import.
 *   - Pure-bookkeeping columns (internal ID, source ID, source URL, first-seen/last-
 *     scraped timestamps) are marked hidden rather than removed — still there for
 *     Power BI or anyone who unhides them, just not cluttering a normal read-through.
 *   - Zebra striping on data rows and the name column frozen alongside the header row
 *     (not just the header) — this sheet is wide, so keeping the identifying column
 *     visible while scrolling right matters.
 *   - The "Summary" sheet stays a separate tab, not mixed into the main data table —
 *     Power BI's "Get Data from Excel" can cleanly pick just the "All Projects" table
 *     without tripping over aggregate rows sitting in the same sheet.
 */

import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabaseAdmin } from '../scrapers/lib/upsert.js'
import { getTypeLabel } from '../src/lib/typeColors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.join(__dirname, '..', 'backups', 'rezoning_projects.xlsx')

const DATE_FORMAT = 'm/d/yyyy'

/** Converts a date-like string (plain "YYYY-MM-DD" or full ISO timestamp) into a real
 * JS Date for a properly-typed Excel cell — returns null (not a string) when there's
 * nothing to convert, so the cell stays genuinely empty rather than showing "null". */
function toExcelDate(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function effectiveValue(manual, auto) {
  return manual || auto || null
}

// Column order chosen for readability when browsing in Excel — most useful fields
// first, technical/bookkeeping fields last (and several of those marked `hidden`).
// This is a PREFERRED order, not an exhaustive whitelist — buildColumns() below
// automatically appends any column that shows up in the actual data but isn't listed
// here, so a future schema change (a new editable field, say) doesn't silently vanish
// from the backup just because someone forgot to update this list by hand.
//
// Computed columns (email/phone/address) use a `compute` function instead of a plain
// `key`, applied per-row in main() below.
const PREFERRED_COLUMNS = [
  { key: 'name', header: 'Name', width: 32 },
  { key: 'municipality', header: 'Municipality', width: 14 },
  { key: 'project_type', header: 'Type', width: 16 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'lead_status', header: 'My Pipeline', width: 14 },
  { key: 'lead_notes', header: 'My Notes', width: 30 },
  {
    key: 'address_effective',
    header: 'Address',
    width: 32,
    compute: (r) => effectiveValue(r.manual_address, r.address),
  },
  { key: 'applicant', header: 'Applicant', width: 24 },
  { key: 'developer', header: 'Developer', width: 20 },
  { key: 'owner', header: 'Owner', width: 20 },
  { key: 'owner_mailing_address', header: 'Owner Mailing Address', width: 32 },
  {
    key: 'email_effective',
    header: 'Email',
    width: 26,
    compute: (r) => effectiveValue(r.manual_contact_email, r.contact_email),
  },
  {
    key: 'phone_effective',
    header: 'Phone',
    width: 16,
    compute: (r) => effectiveValue(r.manual_contact_phone, r.contact_phone),
  },
  { key: 'current_zoning', header: 'Current Zoning', width: 16 },
  { key: 'zoning', header: 'Proposed Zoning', width: 18 },
  { key: 'acreage', header: 'Acreage', width: 10 },
  { key: 'parcel_id', header: 'Parcel ID', width: 20 },
  { key: 'latitude', header: 'Latitude', width: 12 },
  { key: 'longitude', header: 'Longitude', width: 12 },
  { key: 'description', header: 'Description', width: 50 },
  { key: 'request_type', header: 'Request Type', width: 14 },
  {
    key: 'last_action_date',
    header: 'Last Action Date',
    width: 16,
    style: { numFmt: DATE_FORMAT },
    compute: (r) => toExcelDate(r.last_action_date),
  },
  {
    key: 'hearing_date',
    header: 'Hearing Date',
    width: 16,
    style: { numFmt: DATE_FORMAT },
    compute: (r) => toExcelDate(r.hearing_date),
  },
  { key: 'source', header: 'Source Town', width: 14 },
  // Raw source-of-truth breakdown for contact/address — kept visible (not hidden),
  // since "was this auto-detected or did I enter it myself" is genuinely useful to see
  // at a glance or to build a Power BI measure around (e.g. % manually enriched).
  { key: 'address', header: 'Address (auto)', width: 32 },
  { key: 'manual_address', header: 'Address (manual)', width: 32 },
  { key: 'contact_email', header: 'Email (auto)', width: 26 },
  { key: 'manual_contact_email', header: 'Email (manual)', width: 26 },
  { key: 'contact_phone', header: 'Phone (auto)', width: 16 },
  { key: 'manual_contact_phone', header: 'Phone (manual)', width: 16 },
  // Pure bookkeeping from here down — hidden by default, not deleted. Still fully
  // present for Power BI (hidden columns import normally) or anyone who unhides them.
  { key: 'source_id', header: 'Source ID', width: 14, hidden: true },
  { key: 'source_url', header: 'Source URL', width: 40, hidden: true },
  {
    key: 'first_seen_at',
    header: 'First Seen',
    width: 20,
    hidden: true,
    style: { numFmt: DATE_FORMAT },
    compute: (r) => toExcelDate(r.first_seen_at),
  },
  {
    key: 'last_scraped_at',
    header: 'Last Scraped',
    width: 20,
    hidden: true,
    style: { numFmt: DATE_FORMAT },
    compute: (r) => toExcelDate(r.last_scraped_at),
  },
  { key: 'id', header: 'Internal ID', width: 38, hidden: true },
]

/** Turns "some_new_field" into "Some New Field" for an auto-generated column header. */
function humanizeKey(key) {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Builds the final column list: PREFERRED_COLUMNS in their curated order, followed by
 * any keys found in the actual fetched rows that aren't already covered — so a new
 * column added to the database later shows up automatically (with a readable
 * auto-generated header) instead of silently disappearing from the backup.
 */
function buildColumns(rows) {
  const knownKeys = new Set(PREFERRED_COLUMNS.map((c) => c.key))
  const allKeysInData = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) allKeysInData.add(key)
  }
  const extraColumns = [...allKeysInData]
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map((key) => ({ key, header: humanizeKey(key), width: 20 }))

  if (extraColumns.length) {
    console.log(
      `Found ${extraColumns.length} column(s) not in the preferred list, appending automatically: ${extraColumns.map((c) => c.key).join(', ')}`
    )
  }

  return [...PREFERRED_COLUMNS, ...extraColumns]
}

/** Turns a raw Supabase row into the row object actually written to the sheet — plain
 * keys pass through unchanged, `compute`-defined columns get their computed value. */
function toSheetRow(row, columns) {
  const out = {}
  for (const col of columns) {
    out[col.key] = col.compute ? col.compute(row) : row[col.key]
  }
  return out
}

async function fetchAllRows() {
  const pageSize = 1000
  let from = 0
  const allRows = []

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('rezoning_projects')
      .select('*')
      .order('municipality', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('Fetch failed:', error.message)
      throw error
    }
    allRows.push(...data)
    console.log(`  fetched rows ${from}-${from + data.length - 1} (${data.length} in this batch)`)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allRows
}

async function main() {
  console.log('Fetching all rows from Supabase...')
  const rows = await fetchAllRows()
  console.log(`Fetched ${rows.length} total rows.`)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Mecklenburg Rezoning Tracker'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('All Projects')
  const columns = buildColumns(rows)
  sheet.columns = columns

  // Bold header row, frozen alongside the NAME column (not just the header) — this
  // sheet is wide (30+ columns), so keeping the identifying column visible while
  // scrolling right matters for actually reading it. Basic filter dropdowns on the
  // header row too.
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

  rows.forEach((row, i) => {
    const sheetRow = toSheetRow(row, columns)
    // Same "Uncategorized" label the app itself shows for a blank project_type
    // (src/lib/typeColors.js) — keeps the Excel backup consistent with what you see on
    // the live site rather than just leaving these cells empty.
    sheetRow.project_type = getTypeLabel(row.project_type)
    const excelRow = sheet.addRow(sheetRow)
    // Light zebra striping on data rows for readability — every other row gets a
    // faint fill. Purely visual; doesn't affect how Power BI or anything else reads
    // the underlying values.
    if (i % 2 === 1) {
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } }
      })
    }
  })

  // Also add a small "Summary" sheet — quick counts per municipality, useful at a
  // glance without needing to filter the main sheet. Kept as a separate tab
  // specifically so Power BI's "Get Data from Excel" can cleanly pick just the "All
  // Projects" table without these aggregate rows sitting in the same sheet.
  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { key: 'municipality', header: 'Municipality', width: 20 },
    { key: 'count', header: 'Project Count', width: 16 },
  ]
  summarySheet.getRow(1).font = { bold: true }
  const counts = {}
  for (const row of rows) {
    const key = row.municipality || '(unknown)'
    counts[key] = (counts[key] || 0) + 1
  }
  for (const [municipality, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    summarySheet.addRow({ municipality, count })
  }
  summarySheet.addRow({ municipality: 'TOTAL', count: rows.length }).font = { bold: true }

  await workbook.xlsx.writeFile(OUTPUT_PATH)
  console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
