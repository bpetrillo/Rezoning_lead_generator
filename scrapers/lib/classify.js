/**
 * Best-effort classifier for the map's color-coded categories (Residential, Commercial,
 * Industrial, Institutional/Public, Infrastructure, Agricultural, Mixed Use, Govt.
 * Decisions) — matching Boardwalk's legend.
 *
 * IMPORTANT — this is heuristic, not authoritative. None of the 7 towns publish this
 * exact category directly (Pineville is the only exception — its bulletin page already
 * groups projects into categories, handled separately in scrapers/pineville/index.js,
 * not by this file). Everywhere else, this infers a category from whatever real signal
 * each town happens to provide, in priority order:
 *
 *   1. An explicit building-type-like field, when a town has one (confirmed live: only
 *      Davidson does, "Building Type: Single-Family Detached Home") — most reliable.
 *   2. Zoning code prefix matching against traditional NC zoning conventions (R-, B-,
 *      I-, O-, MUD, A-) — reliable for Mint Hill and Matthews, which both use these
 *      traditional codes. Charlotte uses a different, newer "UDO" code system (e.g.
 *      "N2-B(CD)") with its own prefixes — mapped separately and with lower confidence,
 *      since I haven't cross-checked every UDO district against Charlotte's official
 *      definitions, just general knowledge of the more common ones.
 *   3. Keyword matching against the free-text description/request — least reliable,
 *      used for towns where zoning is just a generic value like Cornelius's "Conditional
 *      Zoning" (confirmed live — not a usable code at all).
 *
 * Returns null (not a guess) when nothing matches with reasonable confidence — an
 * uncategorized gray dot on the map is more honest than a wrong-colored one.
 */

const TRADITIONAL_ZONING_PREFIXES = [
  // Order matters: more specific/exception patterns first, generic catch-alls last.
  { pattern: /^R\/I\b/i, type: 'Institutional/Public' }, // Matthews: "Residential/Institutional" — confirmed used for churches/schools (e.g. Covenant Day School, Christ Covenant Church), not plain residential
  { pattern: /^MUD\b|^MX\b/i, type: 'Mixed Use' },
  { pattern: /^CrC/i, type: 'Institutional/Public' }, // Matthews-specific: Crestdale Community district
  { pattern: /^C[-\s]?MF\b/i, type: 'Residential' }, // "Conditional Multi-Family" — residential (apartments/townhomes), not Commercial despite the C
  { pattern: /^B[-\s]?/i, type: 'Commercial' }, // B-1, B-2, B-3, B-H, B-P, etc. — all commercial-family codes
  { pattern: /^I[-\s]?\d/i, type: 'Industrial' },
  { pattern: /^O\b|^O[-\s]?9\b|^INST\b/i, type: 'Commercial' }, // Office — genuinely ambiguous (could be Institutional), defaulting Commercial since description-keyword matching runs first and will catch the institutional cases (church/school/medical) before this ever gets checked
  { pattern: /^A[-\s]?\d|^AG\b/i, type: 'Agricultural' },
  { pattern: /^R[-\s]?VS|^R[-\s]?\d|^RU\b|^R\b/i, type: 'Residential' }, // generic catch-all, checked last
]

// Charlotte's newer Unified Development Ordinance (UDO) codes — lower confidence, see
// file header. Only the more common/recognizable prefixes are mapped.
const UDO_ZONING_PREFIXES = [
  { pattern: /^N1|^N2|^N3|^UR\b/i, type: 'Residential' },
  { pattern: /^CG\b/i, type: 'Commercial' },
  { pattern: /^CR\b|^UC\b|^TOD\b|^MUDD\b/i, type: 'Mixed Use' },
  { pattern: /^I-?1\b|^I-?2\b/i, type: 'Industrial' },
  { pattern: /^INST\b/i, type: 'Institutional/Public' },
]

const KEYWORD_RULES = [
  { pattern: /\bhospital|medical office|clinic|church|school|library|fire station|senior center|senior living\b/i, type: 'Institutional/Public' },
  { pattern: /\btownhome|townhouse|apartment|single-family|single family|subdivision|residential|homes\b/i, type: 'Residential' },
  { pattern: /\bretail|restaurant|hotel|office building|storage|bank|store|brewery|car wash|carwash|dealership\b/i, type: 'Commercial' },
  { pattern: /\bwarehouse|industrial|manufactur|distribution center|flex (space|park)\b/i, type: 'Industrial' },
  { pattern: /\bgreenway|roundabout|road (extension|connector|improvement)|water tower|utility|sewer\b/i, type: 'Infrastructure' },
  { pattern: /\bfarm\b(?!ers)|agricultural\b/i, type: 'Agricultural' },
  { pattern: /\bmixed[\s-]use\b/i, type: 'Mixed Use' },
  { pattern: /\btown hall|municipal building|government center\b/i, type: 'Govt. Decisions' },
]

function matchPrefixes(value, rules) {
  if (!value) return null
  const trimmed = value.trim()
  for (const { pattern, type } of rules) {
    if (pattern.test(trimmed)) return type
  }
  return null
}

function matchKeywords(text) {
  if (!text) return null
  for (const { pattern, type } of KEYWORD_RULES) {
    if (pattern.test(text)) return type
  }
  return null
}

/**
 * @param {object} signals
 * @param {string} [signals.zoning] - proposed/current zoning code or value
 * @param {string} [signals.description] - free-text project description
 * @param {string} [signals.buildingType] - explicit building type, when a town provides one
 * @param {'traditional'|'udo'} [signals.zoningSystem] - which prefix table to use; defaults to traditional
 * @returns {string|null} one of the 8 category labels, or null if unclassifiable
 */
export function classifyProjectType({ zoning, description, buildingType, zoningSystem = 'traditional' } = {}) {
  if (buildingType) {
    const fromBuildingType = matchKeywords(buildingType)
    if (fromBuildingType) return fromBuildingType
  }

  // Description keywords checked before zoning code — actual described use ("hospital",
  // "townhomes") is a more direct signal than an abbreviation that varies by town and is
  // sometimes genuinely ambiguous (e.g. "O" for Office could be Commercial or
  // Institutional depending on the actual tenant).
  const fromDescription = matchKeywords(description)
  if (fromDescription) return fromDescription

  const prefixRules = zoningSystem === 'udo' ? UDO_ZONING_PREFIXES : TRADITIONAL_ZONING_PREFIXES
  const fromZoning = matchPrefixes(zoning, prefixRules)
  if (fromZoning) return fromZoning

  return null
}
