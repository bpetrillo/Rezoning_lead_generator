import { createClient } from '@supabase/supabase-js'
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
 */
export async function upsertProjects(records) {
  if (!records.length) {
    console.log('No records to upsert.')
    return
  }
  const { data, error } = await supabaseAdmin
    .from('rezoning_projects')
    .upsert(
      records.map((r) => ({ ...r, last_scraped_at: new Date().toISOString() })),
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
