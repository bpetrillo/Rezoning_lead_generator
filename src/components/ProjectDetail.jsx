import { useEffect, useState } from 'react'
import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'
import { LEAD_STATUSES } from '../lib/leadStatus.js'
import { supabase } from '../lib/supabaseClient.js'
import { getStateForMunicipality } from '../lib/state.js'
import MiniMap from './MiniMap.jsx'

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 'var(--space-5)' }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', padding: '5px 12px 5px 0', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: 13 }}>
        {label}
      </td>
      <td style={{ padding: '5px 0' }}>{children}</td>
    </tr>
  )
}

export default function ProjectDetail({ project: p, onBack, onUpdate }) {
  const color = getTypeColor(p.project_type)

  const [leadStatus, setLeadStatus] = useState(p.lead_status || '')
  const [leadNotes, setLeadNotes] = useState(p.lead_notes || '')
  const [contactEmail, setContactEmail] = useState(p.manual_contact_email || p.contact_email || '')
  const [contactPhone, setContactPhone] = useState(p.manual_contact_phone || p.contact_phone || '')
  const [address, setAddress] = useState(p.manual_address || p.address || '')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  // Separate from saveState — geocoding is its own async step that happens after the
  // address text itself is saved, and can succeed/fail independently of that save.
  const [geocodeState, setGeocodeState] = useState('idle') // 'idle' | 'geocoding' | 'geocoded' | 'failed'

  useEffect(() => {
    setLeadStatus(p.lead_status || '')
    setLeadNotes(p.lead_notes || '')
    setContactEmail(p.manual_contact_email || p.contact_email || '')
    setContactPhone(p.manual_contact_phone || p.contact_phone || '')
    setAddress(p.manual_address || p.address || '')
    setSaveState('idle')
    setGeocodeState('idle')
  }, [p.id])

  async function saveField(fields) {
    setSaveState('saving')
    const { error } = await supabase.from('rezoning_projects').update(fields).eq('id', p.id)
    setSaveState(error ? 'error' : 'saved')
    if (error) console.error('Failed to save lead tracking field:', error.message)
    else onUpdate?.(p.id, fields)
    return !error
  }

  function handleStatusChange(e) {
    const value = e.target.value
    setLeadStatus(value)
    saveField({ lead_status: value || null })
  }

  function handleNotesBlur() {
    if (leadNotes !== (p.lead_notes || '')) {
      saveField({ lead_notes: leadNotes || null })
    }
  }

  function handleContactEmailBlur() {
    const effectiveCurrent = p.manual_contact_email || p.contact_email || ''
    if (contactEmail !== effectiveCurrent) {
      saveField({ manual_contact_email: contactEmail || null })
    }
  }

  function handleContactPhoneBlur() {
    const effectiveCurrent = p.manual_contact_phone || p.contact_phone || ''
    if (contactPhone !== effectiveCurrent) {
      saveField({ manual_contact_phone: contactPhone || null })
    }
  }

  // Saves the address text as before, then re-geocodes it server-side (via
  // /api/geocode-address — direct browser calls to the Census geocoder are blocked by
  // CORS, confirmed live) so the map pin actually moves to match, instead of the text
  // and the pin silently drifting out of sync. A failed geocode (vague address, no
  // match) leaves the existing coordinates untouched rather than clearing them — a bad
  // new address shouldn't blow away a previously-working pin.
  async function handleAddressBlur() {
    const effectiveCurrent = p.manual_address || p.address || ''
    if (address === effectiveCurrent) return

    const saved = await saveField({ manual_address: address || null })
    if (!saved || !address) return

    setGeocodeState('geocoding')
    try {
      const res = await fetch('/api/geocode-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: p.id, address }),
      })
      const data = await res.json()
      if (data.success) {
        setGeocodeState('geocoded')
        onUpdate?.(p.id, { latitude: data.latitude, longitude: data.longitude })
      } else {
        setGeocodeState('failed')
      }
    } catch (err) {
      console.error('Geocoding request failed:', err)
      setGeocodeState('failed')
    }
  }

  const headlineParts = []
  if (p.acreage) headlineParts.push(`${p.acreage}-Acre`)
  if (p.project_type) headlineParts.push(p.project_type)
  headlineParts.push(p.request_type || 'Development')
  const headline = `${headlineParts.join(' ')}${p.applicant ? ` by ${p.applicant}` : ''}`

  const hasZoningChange = p.current_zoning && p.zoning && p.current_zoning !== p.zoning

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <button onClick={onBack} className="btn-text" style={{ marginBottom: 'var(--space-3)', paddingLeft: 0 }}>
        ← Back to list
      </button>

      <h2 style={{ marginBottom: 10, fontSize: 20 }}>{p.name}</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="badge" style={{ backgroundColor: color }}>
          {getTypeLabel(p.project_type)}
        </span>
        {p.status && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{p.status}</span>}
        {p.last_action_date && <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>· {p.last_action_date}</span>}
        {p.acreage && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>· {p.acreage} acres</span>}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, fontFamily: 'var(--font-display)' }}>{headline}</div>

      <Section title="My Pipeline">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <select className="select" value={leadStatus} onChange={handleStatusChange}>
            {LEAD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Failed to save — try again'}
          </span>
        </div>
        <textarea
          className="input"
          value={leadNotes}
          onChange={(e) => setLeadNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Notes — e.g. who you spoke with, next steps..."
          rows={3}
          style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Section>

      {p.description && <p style={{ color: 'var(--text)', lineHeight: 1.55, marginTop: 'var(--space-4)' }}>{p.description}</p>}

      <Section title="Parties">
        <table style={{ width: '100%', fontSize: 14 }}>
          <tbody>
            <Row label="Applicant">{p.applicant}</Row>
            <Row label="Developer">{p.developer}</Row>
            <Row label="Owner">{p.owner}</Row>
            <Row label="Owner Mailing Address">{p.owner_mailing_address}</Row>
          </tbody>
        </table>
        {!p.applicant && !p.developer && !p.owner && (
          <div style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 8 }}>No parties listed</div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
              Email {p.contact_email && !p.manual_contact_email ? '(auto-detected)' : p.manual_contact_email ? '(your entry)' : ''}
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {saveState === 'saving' && 'Saving...'}
              {saveState === 'saved' && 'Saved'}
              {saveState === 'error' && 'Failed to save — try again'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              onBlur={handleContactEmailBlur}
              placeholder="Add an email address..."
              style={{ flex: 1 }}
            />
            {contactEmail && <a href={`mailto:${contactEmail}`}>✉️</a>}
          </div>

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
            Phone {p.contact_phone && !p.manual_contact_phone ? '(auto-detected)' : p.manual_contact_phone ? '(your entry)' : ''}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              onBlur={handleContactPhoneBlur}
              placeholder="Add a phone number..."
              style={{ flex: 1 }}
            />
            {contactPhone && <a href={`tel:${contactPhone}`}>📞</a>}
          </div>
        </div>
      </Section>

      <Section title="Project Details">
        <table style={{ width: '100%', fontSize: 14 }}>
          <tbody>
            <Row label="Zoning">
              {hasZoningChange ? (
                <>
                  {p.current_zoning} <span style={{ color: 'var(--text-faint)' }}>→</span> {p.zoning}
                </>
              ) : (
                p.zoning || p.current_zoning
              )}
            </Row>
            <Row label="Parcel">{p.parcel_id}</Row>
            <Row label="Request type">{p.request_type}</Row>
            <Row label="Hearing date">{p.hearing_date}</Row>
          </tbody>
        </table>
      </Section>

      <Section title="Location">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
            Address {p.address && !p.manual_address ? '(auto-detected)' : p.manual_address ? '(your entry)' : ''}
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && geocodeState === 'idle' && 'Saved'}
            {saveState === 'error' && 'Failed to save — try again'}
            {geocodeState === 'geocoding' && 'Updating map pin...'}
            {geocodeState === 'geocoded' && 'Saved · map pin updated'}
            {geocodeState === 'failed' && "Saved · couldn't find that address on the map"}
          </span>
        </div>
        <input
          className="input"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={handleAddressBlur}
          placeholder="Add an address..."
          style={{ width: '100%', marginBottom: 10 }}
        />
        <div style={{ marginBottom: 10, color: 'var(--text)' }}>
          {p.municipality}, {getStateForMunicipality(p.municipality)}
        </div>
        <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <MiniMap project={p} />
        </div>
        {geocodeState === 'failed' && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
            Couldn't find that exact address on the map — the pin above hasn't moved.
            Try adding more detail (street number, city) and it'll retry automatically.
          </div>
        )}
      </Section>

      <Section title="Source">
        {p.source_url ? (
          <a href={p.source_url} target="_blank" rel="noreferrer">
            View original filing
          </a>
        ) : (
          <span style={{ color: 'var(--text-faint)' }}>Not available</span>
        )}
      </Section>

      {/*
        Boardwalk's reference design also shows a "Project History" timeline (meeting-
        by-meeting events like "Zoning Committee reviewed the Rezone") and an "Official
        References" petition-tracking box. Those aren't included here because we
        genuinely don't scrape that level of detail — only a single last_action_date and
        hearing_date per project, not a full meeting-by-meeting audit trail. Adding a
        fake-looking timeline from just two dates would look more complete than the data
        actually is. If this is wanted later, it would need a real per-town scraper
        change to capture meeting history, not just a frontend layout change.
      */}
    </div>
  )
}
