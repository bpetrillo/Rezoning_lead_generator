import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'
import { getLeadStatusColor } from '../lib/leadStatus.js'

export default function ProjectList({ projects, loading, error, onSelect }) {
  if (loading) return <div style={{ padding: 16 }}>Loading projects...</div>
  if (error) return <div style={{ padding: 16, color: '#c00' }}>Error: {error}</div>
  if (projects.length === 0) return <div style={{ padding: 16, color: '#666' }}>No projects match these filters.</div>

  return (
    <div>
      {projects.map((p) => {
        const color = getTypeColor(p.project_type)
        const leadColor = getLeadStatusColor(p.lead_status)
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #eee',
              borderLeft: `4px solid ${color}`,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {p.municipality} · {p.address}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
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
              {p.lead_status && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 12,
                    color: 'white',
                    backgroundColor: leadColor,
                  }}
                >
                  {p.lead_status}
                </span>
              )}
              {(p.contact_email || p.contact_phone) && (
                <span title="Contact info available" style={{ fontSize: 13 }}>
                  ✉️
                </span>
              )}
              <span style={{ fontSize: 12, color: '#888' }}>
                {p.status} {p.last_action_date ? `· ${p.last_action_date}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
