import { useMemo, useState } from 'react'
import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'
import { formatShortDate } from '../lib/format.js'
import { downloadCsv } from '../lib/csv.js'

const COLUMNS = [
  { key: 'name', label: 'Name', sortValue: (p) => p.name || '' },
  { key: 'municipality', label: 'Municipality', sortValue: (p) => p.municipality || '' },
  { key: 'project_type', label: 'Type', sortValue: (p) => getTypeLabel(p.project_type) },
  { key: 'status', label: 'Status', sortValue: (p) => p.status || '' },
  { key: 'lead_status', label: 'My Pipeline', sortValue: (p) => p.lead_status || '' },
  { key: 'address', label: 'Address', sortValue: (p) => p.manual_address || p.address || '' },
  { key: 'applicant', label: 'Applicant', sortValue: (p) => p.applicant || '' },
  { key: 'acreageNumeric', label: 'Acreage', sortValue: (p) => p.acreageNumeric },
  { key: 'last_action_date', label: 'Last Action', sortValue: (p) => p.last_action_date || '' },
]

const CSV_COLUMNS = [
  { label: 'Name', value: (p) => p.name },
  { label: 'Municipality', value: (p) => p.municipality },
  { label: 'Type', value: (p) => getTypeLabel(p.project_type) },
  { label: 'Status', value: (p) => p.status },
  { label: 'My Pipeline', value: (p) => p.lead_status },
  { label: 'Address', value: (p) => p.manual_address || p.address },
  { label: 'Applicant', value: (p) => p.applicant },
  { label: 'Developer', value: (p) => p.developer },
  { label: 'Owner', value: (p) => p.owner },
  { label: 'Email', value: (p) => p.manual_contact_email || p.contact_email },
  { label: 'Phone', value: (p) => p.manual_contact_phone || p.contact_phone },
  { label: 'Zoning', value: (p) => p.zoning },
  { label: 'Acreage', value: (p) => p.acreage },
  { label: 'Parcel ID', value: (p) => p.parcel_id },
  { label: 'Last Action Date', value: (p) => formatShortDate(p.last_action_date) },
  { label: 'Source URL', value: (p) => p.source_url },
]

export default function ProjectsTable({ projects, onSelectProject }) {
  // Default sort: most recent activity first, matching the map/list view's default.
  const [sortKey, setSortKey] = useState('last_action_date')
  const [sortDir, setSortDir] = useState('desc')

  function handleHeaderClick(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey)
    if (!column) return projects
    const withValues = projects.map((p) => ({ p, v: column.sortValue(p) }))
    withValues.sort((a, b) => {
      // Nulls always sort last regardless of direction — a missing acreage or date
      // shouldn't jump to the top just because you clicked "descending".
      if (a.v == null && b.v == null) return 0
      if (a.v == null) return 1
      if (b.v == null) return -1
      if (a.v < b.v) return sortDir === 'asc' ? -1 : 1
      if (a.v > b.v) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return withValues.map((x) => x.p)
  }, [projects, sortKey, sortDir])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 16px',
          borderBottom: '1px solid #e2e2e2',
        }}
      >
        <button
          onClick={() => downloadCsv('projects.csv', CSV_COLUMNS, sorted)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, background: 'white', cursor: 'pointer' }}
        >
          ⬇ CSV
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'white', borderBottom: '2px solid #e2e2e2', textAlign: 'left' }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col.key)}
                  style={{ padding: '10px 16px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  {col.label}
                  {sortKey === col.key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const color = getTypeColor(p.project_type)
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                >
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{p.municipality}</td>
                  <td style={{ padding: '10px 16px' }}>
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
                  </td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{p.status || '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{p.lead_status || '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{p.manual_address || p.address || '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{p.applicant || '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>
                    {p.acreageNumeric != null ? p.acreageNumeric : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{formatShortDate(p.last_action_date) || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <div style={{ padding: 24, color: '#999', textAlign: 'center' }}>No projects match these filters.</div>}
      </div>
    </div>
  )
}
