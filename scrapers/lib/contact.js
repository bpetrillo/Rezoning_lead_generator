/**
 * Extracts contact info (email, phone) that's opportunistically embedded in text we
 * already scrape — this does NOT go looking up contact info anywhere new, it only
 * pulls out what's already sitting in applicant/developer/owner/description text.
 *
 * Confirmed real case: Davidson's Applicant/Developer/Property Owner fields sometimes
 * include an email inline, e.g. "Matt Gallagher, matt@blueheeldevelopment.com"
 * (confirmed live on the Davidson Carwash project page). No real phone number example
 * has been seen yet in any town's data — that regex is included defensively for towns
 * that might have one, but is unverified against real data.
 *
 * Applied centrally in upsertProjects() (scrapers/lib/upsert.js) rather than edited
 * into each of the 7 scrapers individually — one place to maintain, and it
 * automatically covers any town whose data happens to include this, not just the one
 * confirmed case.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const PHONE_PATTERN = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/

function firstMatch(pattern, ...texts) {
  for (const text of texts) {
    if (!text) continue
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}

/**
 * Given a record with applicant/developer/owner/description fields, returns
 * { contact_email, contact_phone } derived from whichever field has one — checked in
 * an order that favors the most likely real point of contact first (applicant, then
 * developer, then owner, then description as a last resort).
 */
export function deriveContactInfo(record) {
  const sources = [record.applicant, record.developer, record.owner, record.description]
  return {
    contact_email: firstMatch(EMAIL_PATTERN, ...sources),
    contact_phone: firstMatch(PHONE_PATTERN, ...sources),
  }
}
