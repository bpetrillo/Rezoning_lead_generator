/**
 * The `acreage` field is stored as text, not a number, because real values across towns
 * include things a plain number can't hold: "+/-2" (Davidson approximations), "25.79
 * Acres" (Cornelius includes the unit word), plain "7.54" (Mint Hill), etc. This pulls
 * out a real usable number for sorting/filtering, without needing a schema change or a
 * re-scrape — computed on the fly from data already in hand.
 */
export function parseAcreageNumber(acreageText) {
  if (!acreageText) return null
  const match = String(acreageText).match(/(\d+\.?\d*)/)
  if (!match) return null
  const num = parseFloat(match[1])
  return isNaN(num) ? null : num
}
