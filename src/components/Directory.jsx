import { useMemo, useState } from 'react'
import { buildDirectory } from '../lib/directory.js'
import { formatShortDate } from '../lib/format.js'
import { downloadCsv } from '../lib/csv.js'

const CSV_COLUMNS = [
  { label: 'Name', value: (r) => r.name },
  { label: 'Type', value: (r) => r.entityType },
  { label: 'Roles', value: (r) => r.roles.join('; ') },
  { label: 'Projects', value: (r) => r.projectCount },
  { label: 'Locations', value: (r) => r.municipalities.join('; ') },
  { label: 'Project Types', value: (r) => r.projectTypes.join('; ') },
  { label: 'Last Seen', value: (r) => formatShortDate(r.lastSeen) || '' },
  { label: 'Email', value: (r) => r.contactEmail || '' },
  { label: 'Phone', value: (r) => r.contactPhone || '' },
]

export default function Directory({ projects, onSelectParty }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const directory = useMemo(() => buildDirectory(projects), [projects])

  const roles = useMemo(
    () => Array.from(new Set(directory.flatMap((d) => d.roles))).sort(),
    [directory]
  )

  const filtered = useMemo(() => {
    return directory
      .filter((d) => {
        if (roleFilter !== 'all' && !d.roles.includes(roleFilter)) return false
        if (typeFilter !== 'all' && d.entityType !== typeFilter) return false
        if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => b.projectCount - a.projectCount)
  }, [directory, roleFilter, typeFilter, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Companies & People</option>
          <option value="Company">Companies</option>
          <option value="Person">People</option>
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 14, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {filtered.length} parties
        </span>
        <button className="btn" onClick={() => downloadCsv('directory.csv', CSV_COLUMNS, filtered)}>
          ⬇ CSV
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Role</th>
              <th>Projects</th>
              <th>Location</th>
              <th>Project Types</th>
              <th>Last Seen</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.name} onClick={() => onSelectParty?.(d.name)}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{d.entityType}</td>
                <td style={{ color: 'var(--text-muted)' }}>{d.roles.join(', ')}</td>
                <td>{d.projectCount}</td>
                <td style={{ color: 'var(--text-muted)' }}>
                  {d.municipalities[0] || '—'}
                  {d.municipalities.length > 1 ? ` +${d.municipalities.length - 1}` : ''}
                </td>
                <td>
                  {d.projectTypes.slice(0, 2).map((t) => (
                    <span key={t} className="badge badge-neutral" style={{ marginRight: 4 }}>
                      {t}
                    </span>
                  ))}
                  {d.projectTypes.length > 2 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>+{d.projectTypes.length - 2}</span>
                  ) : null}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{formatShortDate(d.lastSeen) || '—'}</td>
                <td>
                  {d.contactEmail && (
                    <a href={`mailto:${d.contactEmail}`} onClick={(e) => e.stopPropagation()} style={{ marginRight: 8 }}>
                      ✉️
                    </a>
                  )}
                  {d.contactPhone && (
                    <a href={`tel:${d.contactPhone}`} onClick={(e) => e.stopPropagation()}>
                      📞
                    </a>
                  )}
                  {!d.contactEmail && !d.contactPhone && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center' }}>
            No parties match these filters. Try a broader search or clearing a filter above.
          </div>
        )}
      </div>
    </div>
  )
}
