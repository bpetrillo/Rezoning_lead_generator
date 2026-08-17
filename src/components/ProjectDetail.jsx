import { useEffect, useState } from 'react'
import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'
import { LEAD_STATUSES } from '../lib/leadStatus.js'
import { supabase } from '../lib/supabaseClient.js'
import MiniMap from './MiniMap.jsx'

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 8 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <tr>
      <td style={{ color: '#888', padding: '4px 12px 4px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '4px 0' }}>{children}</td>
    </tr>
  )
}

export default function ProjectDetail({ project: p, onBack, onUpdate }) {
  const color = getTypeColor(p.project_type)

  // Local edit state for the two personal-tracking fields. Reset whenever the selected
  // project actually changes (p.id) — this component doesn't always unmount between
  // selections (e.g. clicking a different map marker while this panel is already open
  // just updates props, it doesn't remount), so initializing state only once with
  // useState's initial value would leave stale Contacted/Interested/etc. showing for
  // the wrong project.
  const [leadStatus, setLeadStatus] = useState(p.lead_status || '')
  const [leadNotes, setLeadNotes] = useState(p.lead_notes || '')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

  useEffect(() => {
    setLeadStatus(p.lead_status || '')
    setLeadNotes(p.lead_notes || '')
    setSaveState('idle')
  }, [p.id])

  async function saveField(fields) {
    setSaveState('saving')
    const { error } = await supabase.from('rezoning_projects').update(fields).eq('id', p.id)
    setSaveState(error ? 'error' : 'saved')
    if (error) console.error('Failed to save lead tracking field:', error.message)
    else onUpdate?.(p.id, fields)
  }

  function handleStatusChange(e) {
    const value = e.target.value
    setLeadStatus(value)
    saveField({ lead_status: value || null })
  }

  function handleNotesBlur() {
    // Saved on blur rather than on every keystroke — avoids a network request per
    // character while typing.
    if (leadNotes !== (p.lead_notes || '')) {
      saveField({ lead_notes: leadNotes || null })
    }
  }

  // Boardwalk shows a headline summary like "4.94-Acre Residential Rezoning by True
  // Homes" — built here from whatever real fields we actually have (acreage,
  // project_type, request_type, applicant), skipping any piece that's missing rather
  // than fabricating a fake-sounding sentence.
  const headlineParts = []
  if (p.acreage) headlineParts.push(`${p.acreage}-Acre`)
  if (p.project_type) headlineParts.push(p.project_type)
  headlineParts.push(p.request_type || 'Development')
  const headline = `${headlineParts.join(' ')}${p.applicant ? ` by ${p.applicant}` : ''}`

  const hasZoningChange = p.current_zoning && p.zoning && p.current_zoning !== p.zoning

  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={{ marginBottom: 12, cursor: 'pointer' }}>
        ← Back to list
      </button>

      <h2 style={{ margin: '0 0 8px' }}>{p.name}</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 12,
            color: 'white',
            backgroundColor: color,
          }}
        >
          {getTypeLabel(p.project_type)}
        </span>
        {p.status && <span style={{ color: '#666', fontSize: 13 }}>{p.status}</span>}
        {p.last_action_date && <span style={{ color: '#999', fontSize: 13 }}>· {p.last_action_date}</span>}
        {p.acreage && <span style={{ color: '#666', fontSize: 13 }}>· {p.acreage} acres</span>}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{headline}</div>

      <Section title="My Pipeline">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <select
            value={leadStatus}
            onChange={handleStatusChange}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: '#999' }}>
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Failed to save — try again'}
          </span>
        </div>
        <textarea
          value={leadNotes}
          onChange={(e) => setLeadNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Notes — e.g. who you spoke with, next steps..."
          rows={3}
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </Section>

      {p.description && <p style={{ color: '#333', lineHeight: 1.5 }}>{p.description}</p>}

      <Section title="Parties">
        <table style={{ width: '100%', fontSize: 14 }}>
          <tbody>
            <Row label="Applicant">{p.applicant}</Row>
            <Row label="Developer">{p.developer}</Row>
            <Row label="Owner">{p.owner}</Row>
          </tbody>
        </table>
        {!p.applicant && !p.developer && !p.owner && (
          <div style={{ color: '#999', fontSize: 13 }}>Not listed</div>
        )}
      </Section>

      <Section title="Project Details">
        <table style={{ width: '100%', fontSize: 14 }}>
          <tbody>
            <Row label="Zoning">
              {hasZoningChange ? (
                <>
                  {p.current_zoning} <span style={{ color: '#999' }}>→</span> {p.zoning}
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
        <div style={{ marginBottom: 8, color: '#333' }}>
          📍 {p.address ? `${p.address}, ` : ''}
          {p.municipality}, NC
        </div>
        <MiniMap project={p} />
      </Section>

      <Section title="Source">
        {p.source_url ? (
          <a href={p.source_url} target="_blank" rel="noreferrer">
            View original filing
          </a>
        ) : (
          <span style={{ color: '#999' }}>Not available</span>
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
