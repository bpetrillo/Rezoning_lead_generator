/**
 * POST /api/geocode-address
 * Body: { projectId: string, address: string }
 *
 * Re-geocodes a single project's address on demand — used when a user manually edits
 * a project's address in the app and wants the map pin to move to match.
 *
 * Runs server-side for two real reasons, both confirmed live:
 *   1. CORS: the US Census Geocoder API blocks direct browser calls (confirmed via a
 *      live fetch attempt from the deployed app — "Failed to fetch"). Server-to-server
 *      calls aren't subject to CORS, so this proxies the request from here instead.
 *   2. RLS: the app's Supabase row-level-security policy only allows the anonymous
 *      client to update a specific set of fields (lead_status, lead_notes, contact
 *      info, manual_address) — NOT latitude/longitude. Rather than widening that
 *      policy for every visitor, this function uses the Supabase service role key
 *      (server-side only, never exposed to the browser) to make just this one
 *      specific, validated update.
 *
 * On a failed geocode (no match — e.g. a vague address like "Waxhaw Highway" with no
 * street number), this returns success: false rather than clearing existing
 * coordinates — a bad new address shouldn't blow away a previously-working pin.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { projectId, address } = req.body || {}
  if (!projectId || !address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'projectId and a non-empty address are required' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable')
    return res.status(500).json({ error: 'Server is not configured for geocoding' })
  }

  let coordinates
  try {
    const geocodeUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(
      address
    )}&benchmark=Public_AR_Current&format=json`
    const geocodeRes = await fetch(geocodeUrl)
    if (!geocodeRes.ok) {
      return res.status(200).json({ success: false, reason: 'geocoder_unavailable' })
    }
    const geocodeData = await geocodeRes.json()
    const match = geocodeData?.result?.addressMatches?.[0]
    if (!match?.coordinates) {
      return res.status(200).json({ success: false, reason: 'no_match' })
    }
    coordinates = { latitude: match.coordinates.y, longitude: match.coordinates.x }
  } catch (err) {
    console.error('Geocoding request failed:', err)
    return res.status(200).json({ success: false, reason: 'geocoder_error' })
  }

  try {
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/rezoning_projects?id=eq.${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
    })
    if (!updateRes.ok) {
      const text = await updateRes.text()
      console.error('Supabase update failed:', updateRes.status, text)
      return res.status(500).json({ success: false, reason: 'database_update_failed' })
    }
  } catch (err) {
    console.error('Supabase update request failed:', err)
    return res.status(500).json({ success: false, reason: 'database_update_failed' })
  }

  return res.status(200).json({ success: true, latitude: coordinates.latitude, longitude: coordinates.longitude })
}
