/**
 * Sub-classifies a project into an "Asset Class" WITHIN its already-determined Project
 * Category — e.g. within Commercial: Retail, Hotel, Restaurant, Gas Station/
 * Convenience, Office, Bank, Storage, Auto/Dealership. Same approach as
 * scrapers/lib/classify.js's category classifier: keyword matching against the
 * description text, best-effort and heuristic, not authoritative.
 *
 * Returns "Pending Classification" (matching Boardwalk's own fallback label for
 * genuinely unclassifiable cases) rather than null, since this is a display label for
 * the Report page's drill-down — a category always needs SOME bucket to fall into for
 * the breakdown to add up to the filtered total, unlike the top-level category
 * classifier where a blank "Uncategorized" dot on the map is the honest choice.
 */

const ASSET_CLASS_RULES = {
  Commercial: [
    { pattern: /\bhotel\b/i, label: 'Hotel' },
    { pattern: /\brestaurant|brewery|brewpub\b/i, label: 'Restaurant' },
    { pattern: /\bgas station|convenience|car wash|carwash\b/i, label: 'Gas Station/Convenience' },
    { pattern: /\bbank\b/i, label: 'Bank/Financial' },
    { pattern: /\bdealership\b/i, label: 'Auto/Dealership' },
    { pattern: /\bstorage\b/i, label: 'Storage' },
    { pattern: /\boffice\b/i, label: 'Office' },
    { pattern: /\bretail|store|shopping\b/i, label: 'Retail' },
  ],
  Residential: [
    { pattern: /\bsenior center|senior living\b/i, label: 'Senior Living' },
    { pattern: /\bapartment|multi-family|multi family\b/i, label: 'Multi-Family/Apartments' },
    { pattern: /\btownhome|townhouse\b/i, label: 'Townhomes' },
    { pattern: /\bsingle-family|single family|subdivision\b/i, label: 'Single-Family' },
  ],
  'Institutional/Public': [
    { pattern: /\bsenior center|senior living\b/i, label: 'Senior Living' },
    { pattern: /\bhospital|medical office|clinic\b/i, label: 'Medical/Hospital' },
    { pattern: /\bchurch|ministries\b/i, label: 'Religious' },
    { pattern: /\bschool|university\b/i, label: 'Education' },
    { pattern: /\btown hall|municipal|government center|county|city of\b/i, label: 'Government/Municipal' },
    { pattern: /\bfire station\b/i, label: 'Public Safety' },
    { pattern: /\blibrary\b/i, label: 'Library' },
  ],
  Industrial: [
    { pattern: /\bwarehouse|distribution center\b/i, label: 'Warehouse/Distribution' },
    { pattern: /\bmanufactur\b/i, label: 'Manufacturing' },
    { pattern: /\bflex (space|park)\b/i, label: 'Flex Space' },
  ],
  Infrastructure: [
    { pattern: /\bgreenway|roundabout|road (extension|connector|improvement)\b/i, label: 'Road/Transportation' },
    { pattern: /\bwater tower|utility|sewer\b/i, label: 'Utility' },
  ],
}

const FALLBACK_LABEL = 'Pending Classification'

/**
 * @param {string} category - one of the Project Category labels (e.g. 'Commercial')
 * @param {object} signals
 * @param {string} [signals.description]
 * @param {string} [signals.buildingType]
 * @returns {string} an asset-class label, or "Pending Classification" if nothing matches
 */
export function classifyAssetClass(category, { description, buildingType } = {}) {
  const rules = ASSET_CLASS_RULES[category]
  if (!rules) return FALLBACK_LABEL
  const text = [buildingType, description].filter(Boolean).join(' ')
  if (!text) return FALLBACK_LABEL
  for (const { pattern, label } of rules) {
    if (pattern.test(text)) return label
  }
  return FALLBACK_LABEL
}
