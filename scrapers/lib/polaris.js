/**
 * Shared helpers for querying Mecklenburg County's public Polaris parcel-record
 * system — a free, unauthenticated government API. Verified live 2026-08-21/22 against
 * real parcel IDs from four different towns (Davidson, Mint Hill, Matthews, Cornelius).
 *
 * Parcel ID format quirk, confirmed live: different towns' own parcel numbering doesn't
 * always match Polaris's internal PID directly — Mint Hill's own site shows
 * "195-182-45", but Polaris needs the dashes stripped ("19518245"). Handled by
 * extractParcelCandidates() below, which also handles multi-parcel fields (e.g.
 * Cornelius: "00706207, 00706219, & 00706216") and stray text fragments (e.g. Matthews:
 * "...and a portion of 215-081-36").
 */

export const POLARIS_BASE = 'https://polaris3g.mecklenburgcountync.gov/api/bolt'

export function extractParcelCandidates(rawParcelField) {
  if (!rawParcelField) return []
  return rawParcelField
    .split(/,|&|\band\b/i)
    .map((s) => s.replace(/[^0-9]/g, ''))
    .filter((s) => s.length >= 6 && s.length <= 10)
}

/** Fetches the raw Polaris record for one parcel ID, or null if not found. */
export async function fetchParcelRecord(parcelId) {
  const res = await fetch(`${POLARIS_BASE}?pid=${parcelId}&page=1`)
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) && data[0] ? data[0] : null
}
