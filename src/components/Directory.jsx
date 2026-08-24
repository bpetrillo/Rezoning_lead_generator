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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e2e2e2',
        }}
      >
        <input
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
        >
          <option value="all">Companies & People</option>
          <option value="Company">Companies</option>
          <option value="Person">People</option>
        </select>
        <span style={{ color: '#666', fontSize: 14, whiteSpace: 'nowrap' }}>{filtered.length} parties</span>
        <button
          onClick={() => downloadCsv('directory.csv', CSV_COLUMNS, filtered)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, background: 'white', cursor: 'pointer' }}
        >
          ⬇ CSV
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'white', borderBottom: '2px solid #e2e2e2', textAlign: 'left' }}>
              <th style={{ padding: '10px 16px' }}>Name</th>
              <th style={{ padding: '10px 16px' }}>Type</th>
              <th style={{ padding: '10px 16px' }}>Role</th>
              <th style={{ padding: '10px 16px' }}>Projects</th>
              <th style={{ padding: '10px 16px' }}>Location</th>
              <th style={{ padding: '10px 16px' }}>Project Types</th>
              <th style={{ padding: '10px 16px' }}>Last Seen</th>
              <th style={{ padding: '10px 16px' }}>Contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr
                key={d.name}
                onClick={() => onSelectParty?.(d.name)}
                style={{ borderBottom: '1px solid #eee', cursor: onSelectParty ? 'pointer' : 'default' }}
              >
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{d.name}</td>
                <td style={{ padding: '10px 16px', color: '#666' }}>{d.entityType}</td>
                <td style={{ padding: '10px 16px', color: '#666' }}>{d.roles.join(', ')}</td>
                <td style={{ padding: '10px 16px' }}>{d.projectCount}</td>
                <td style={{ padding: '10px 16px', color: '#666' }}>
                  {d.municipalities[0] || '—'}
                  {d.municipalities.length > 1 ? ` +${d.municipalities.length - 1}` : ''}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {d.projectTypes.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-block',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: '#eee',
                        marginRight: 4,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  {d.projectTypes.length > 2 ? (
                    <span style={{ fontSize: 12, color: '#999' }}>+{d.projectTypes.length - 2}</span>
                  ) : null}
                </td>
                <td style={{ padding: '10px 16px', color: '#666' }}>{formatShortDate(d.lastSeen) || '—'}</td>
                <td style={{ padding: '10px 16px' }}>
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
                  {!d.contactEmail && !d.contactPhone && <span style={{ color: '#ccc' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 24, color: '#999', textAlign: 'center' }}>No parties match these filters.</div>}
      </div>
    </div>
  )
}
