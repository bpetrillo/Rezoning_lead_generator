import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'
import { getLeadStatusColor } from '../lib/leadStatus.js'

export default function ProjectList({ projects, loading, error, onSelect }) {
  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading projects…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load projects: {error}</div>
  if (projects.length === 0)
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)' }}>
        No projects match these filters. Try clearing a filter or widening the date range above.
      </div>
    )

  return (
    <div>
      {projects.map((p) => {
        const color = getTypeColor(p.project_type)
        const leadColor = getLeadStatusColor(p.lead_status)
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            className="list-row"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {p.municipality} · {p.manual_address || p.address}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="badge" style={{ backgroundColor: color }}>
                {getTypeLabel(p.project_type)}
              </span>
              {p.lead_status && (
                <span className="badge" style={{ backgroundColor: leadColor }}>
                  {p.lead_status}
                </span>
              )}
              {(p.contact_email || p.contact_phone || p.manual_contact_email || p.manual_contact_phone) && (
                <span title="Contact info available" style={{ fontSize: 13 }}>
                  ✉️
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {p.status} {p.last_action_date ? `· ${p.last_action_date}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
