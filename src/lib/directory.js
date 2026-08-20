// Builds a "Directory" of unique parties (people/companies) by aggregating across
// every project's applicant/developer/owner fields. There's no dedicated "parties"
// table — this derives one on the fly from data already loaded, so it stays in sync
// automatically as new projects come in.
//
// Two things are genuinely best-effort heuristics here, not reliable facts:
//   1. "Company" vs "Person" — classified from the name text itself (common company
//      suffixes/keywords). This WILL misclassify real companies that don't use an
//      obvious suffix (e.g. "Verizon Wireless", "Walmart") — there's no way to know
//      this reliably without an actual company database, which is out of scope here.
//   2. "Role" — limited to Applicant/Developer/Owner, since that's genuinely all the
//      schema tracks. Boardwalk's reference shows richer roles (Builder, Engineer) that
//      would need new scraped fields to populate accurately, not just a frontend change.

const COMPANY_KEYWORDS =
  /\b(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|Group|Partners|Partnership|LP|LLP|PLLC|PC|Trust|Enterprises|Holdings|Properties|Development|Developments|Builders|Construction|Homes|Realty|Ventures|Associates|Bank|Church|School|District|Authority|Airport|Aviation|Utilities|Energy|Communications|Systems|Solutions|Services|Technologies|Industries|Manufacturing|Logistics|Storage|University|Hospital|Wireless|Retail|Ministries|Residential|Commercial|Capital|Investments|Design|Studio|Architects|Engineers|Consulting|Land)\b/i

export function classifyEntityType(name) {
  if (!name) return 'Company'
  if (COMPANY_KEYWORDS.test(name)) return 'Company'
  // "&" or "and" joining what look like two names/entities (e.g. "Smith & Associates",
  // "Palillo and Sons") reads as a company/partnership more often than a single person.
  if (/\s(&|and)\s/i.test(name)) return 'Company'
  // Fallback: a name with more than 3 words, or containing digits, doesn't look like a
  // typical "First Last" person's name — default to Company as the safer guess for
  // anything unusual, since most scraped names ARE the applying company/LLC rather
  // than a person.
  const wordCount = name.trim().split(/\s+/).length
  if (wordCount > 3 || /\d/.test(name)) return 'Company'
  return 'Person'
}

/**
 * @param {Array} projects - the full loaded project list
 * @returns {Array} one entry per unique party name, with aggregated stats
 */
export function buildDirectory(projects) {
  const map = new Map()

  for (const p of projects) {
    const roleEntries = [
      { name: p.applicant, role: 'Applicant' },
      { name: p.developer, role: 'Developer' },
      { name: p.owner, role: 'Owner' },
    ]

    for (const { name, role } of roleEntries) {
      const key = name?.trim()
      if (!key) continue

      if (!map.has(key)) {
        map.set(key, {
          name: key,
          entityType: classifyEntityType(key),
          roles: new Set(),
          projectIds: new Set(),
          projectTypes: new Set(),
          municipalities: new Set(),
          lastSeen: null,
          contactEmail: null,
          contactPhone: null,
        })
      }

      const entry = map.get(key)
      entry.roles.add(role)
      entry.projectIds.add(p.id)
      if (p.project_type) entry.projectTypes.add(p.project_type)
      if (p.municipality) entry.municipalities.add(p.municipality)

      // "Last seen" prefers the project's own last action date; falls back to when it
      // was last scraped if that's missing, so entries whose projects have no recorded
      // action date still get a sensible recency signal instead of showing nothing.
      const seenDate = p.last_action_date || p.last_scraped_at
      if (seenDate && (!entry.lastSeen || seenDate > entry.lastSeen)) entry.lastSeen = seenDate

      const email = p.manual_contact_email || p.contact_email
      const phone = p.manual_contact_phone || p.contact_phone
      if (email && !entry.contactEmail) entry.contactEmail = email
      if (phone && !entry.contactPhone) entry.contactPhone = phone
    }
  }

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    roles: Array.from(entry.roles).sort(),
    projectCount: entry.projectIds.size,
    projectTypes: Array.from(entry.projectTypes).sort(),
    municipalities: Array.from(entry.municipalities).sort(),
  }))
}
