/**
 * Decodes the small set of HTML entities that actually show up in real scraped
 * government-site text. Not a full HTML entity decoder — just the ones confirmed to
 * appear in practice across this project's sources.
 *
 * Found via a real data-quality review: Waxhaw, Indian Trail, and Monroe's scrapers
 * each independently missed &amp; decoding, showing up as literal "&amp;" in real
 * project names ("AVSONS Kitchen &amp; Bath") and addresses ("Providence Rd &amp;
 * Prescot Glen Parkway"). Centralizing this here instead of patching each scraper
 * separately, so future scrapers get correct decoding by default.
 */
export function decodeHtmlEntities(text) {
  if (!text) return text
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '\u2014')
}
