/**
 * Shared address geocoding helper, using the US Census Bureau's Geocoder API.
 *
 * Verified live on 2026-08-13 (see scrapers/README.md for context): free, keyless,
 * no rate-limit documentation found so a small delay between calls is used out of
 * courtesy. Returns clean { addressMatches: [] } for addresses it can't resolve —
 * confirmed against a real "unaddressed parcel on X Road" case from Cornelius — rather
 * than an error, so failures here are expected and handled quietly, not exceptional.
 *
 * Only works for real street addresses. Does NOT work for parcel-number-only lookups
 * (Mint Hill's data has no address field at all, only parcel numbers) — that would
 * need a different API (e.g. Mecklenburg County's parcel/GIS lookup), not implemented
 * here. Geocoding Mint Hill is still a TODO for that reason.
 */

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

/**
 * Looks up a single address and returns { latitude, longitude } or { latitude: null,
 * longitude: null } if no match / on error. Never throws — a geocoding miss shouldn't
 * take down an entire scraper run.
 */
export async function geocodeAddress(address) {
  if (!address) return { latitude: null, longitude: null }

  try {
    const url = `${GEOCODER_URL}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`  geocode request failed (${res.status}) for "${address}"`)
      return { latitude: null, longitude: null }
    }
    const data = await res.json()
    const match = data?.result?.addressMatches?.[0]
    if (!match) return { latitude: null, longitude: null }
    return { latitude: match.coordinates.y, longitude: match.coordinates.x }
  } catch (err) {
    console.warn(`  geocode error for "${address}": ${err.message}`)
    return { latitude: null, longitude: null }
  }
}

/**
 * Geocodes every record in an array that has an address but no coordinates yet,
 * mutating latitude/longitude in place. Adds a small delay between calls as a courtesy
 * to the API (no official rate limit found, but this is good practice regardless).
 *
 * Some scrapers' addresses are street-only with no city (e.g. Matthews: "9520 E
 * Independence Blvd", Cornelius: "20401 Zion Ave") while others already include it
 * (Davidson: "121-129 North Main Street, Davidson, NC 28036"). Street-only addresses
 * risk matching a similarly-named street in the wrong NC town, so municipality + ", NC"
 * gets appended when it's not already present in the string.
 */
export async function geocodeRecords(records, { delayMs = 200 } = {}) {
  let geocoded = 0
  let skipped = 0
  for (const record of records) {
    if (record.latitude != null && record.longitude != null) continue
    if (!record.address) {
      skipped++
      continue
    }
    const hasMunicipality =
      record.municipality && record.address.toLowerCase().includes(record.municipality.toLowerCase())
    const query = hasMunicipality || !record.municipality
      ? record.address
      : `${record.address}, ${record.municipality}, NC`

    const { latitude, longitude } = await geocodeAddress(query)
    record.latitude = latitude
    record.longitude = longitude
    if (latitude != null) geocoded++
    await new Promise((r) => setTimeout(r, delayMs))
  }
  console.log(`Geocoded ${geocoded} records (${skipped} skipped — no address).`)
  return records
}
