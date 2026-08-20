/**
 * "Last seen" / project dates mix two different source formats: last_action_date (a
 * plain date, e.g. "2025-09-15") and last_scraped_at (a full timestamp, e.g.
 * "2026-08-18T19:07:56.914+00:00") used as a fallback when the former is missing.
 * Normalizes both to a short MM/DD/YYYY display regardless of which one it is.
 */
export function formatShortDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return value // fall back to raw value rather than hide it
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const yyyy = date.getUTCFullYear()
  return `${mm}/${dd}/${yyyy}`
}
