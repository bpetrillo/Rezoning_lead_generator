import { createClient } from '@supabase/supabase-js'
import { deriveContactInfo } from './contact.js'
import 'dotenv/config'

// IMPORTANT: scrapers run server-side (GitHub Actions / your own machine) and use the
// SERVICE ROLE key, which bypasses row-level security. Never expose this key to the
// frontend or commit it to the repo — set it as a GitHub Actions secret / local .env.
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. See .env.example.'
  )
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

/**
 * Upserts a batch of normalized project records, keyed on (source, source_id).
 * Each record should match the rezoning_projects table shape in supabase/schema.sql.
 *
 * Postgres' ON CONFLICT can't update the same row twice within one batch — it errors
 * with "ON CONFLICT DO UPDATE command cannot affect row a second time" if two records
 * in the array share a (source, source_id) key. This happens for real on Matthews'
 * old bundled "Motion" rows (e.g. multiple sub-cases collapsing to the same parsed ID)
 * — deduping here protects every scraper from this, not just the one that surfaced it.
 * Later duplicates get a numeric suffix appended to source_id so they're still saved
 * (just as a distinct row) rather than silently dropped.
 */
export async function upsertProjects(records) {
  if (!records.length) {
    console.log('No records to upsert.')
    return
  }

  // Derive contact_email/contact_phone here — centrally, once — rather than editing
  // each of the 7 scraper files individually. Automatically covers any town whose
  // scraped text happens to include contact info, not just the one confirmed case
  // (Davidson). See scrapers/lib/contact.js for details.
  const withContactInfo = records.map((r) => ({ ...r, ...deriveContactInfo(r) }))

  const seen = new Map() // key -> count
  const deduped = withContactInfo.map((r) => {
    const key = `${r.source}::${r.source_id}`
    const count = seen.get(key) || 0
    seen.set(key, count + 1)
    if (count === 0) return r
    console.warn(`  duplicate source_id "${r.source_id}" (source: ${r.source}) — suffixing to keep both rows`)
    return { ...r, source_id: `${r.source_id}-dup${count}` }
  })

  const { data, error } = await supabaseAdmin
    .from('rezoning_projects')
    .upsert(
      deduped.map((r) => ({ ...r, last_scraped_at: new Date().toISOString() })),
      { onConflict: 'source,source_id' }
    )
    .select()

  if (error) {
    console.error('Upsert failed:', error.message)
    throw error
  }
  console.log(`Upserted ${data.length} records.`)
  return data
}
