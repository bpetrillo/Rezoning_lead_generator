import { useMemo } from 'react'
import { buildDirectory } from '../lib/directory.js'
import { formatShortDate } from '../lib/format.js'
import { getTypeColor, getTypeLabel } from '../lib/typeColors.js'

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

export default function PartyDetail({ partyName, projects, onBack, onSelectProject, onSelectParty }) {
  const directory = useMemo(() => buildDirectory(projects), [projects])
  const party = useMemo(() => directory.find((d) => d.name === partyName), [directory, partyName])

  const partyProjects = useMemo(() => {
    if (!party) return []
    return projects
      .filter((p) => party.projectIds.has(p.id))
      .sort((a, b) => (b.last_action_date || '').localeCompare(a.last_action_date || ''))
  }, [party, projects])

  // "Worked With" — real, not guessed: other directory entries whose project set
  // overlaps with this party's, ranked by how many projects they actually share.
  const workedWith = useMemo(() => {
    if (!party) return []
    return directory
      .filter((d) => d.name !== partyName)
      .map((d) => ({
        ...d,
        sharedCount: [...d.projectIds].filter((id) => party.projectIds.has(id)).length,
      }))
      .filter((d) => d.sharedCount > 0)
      .sort((a, b) => b.sharedCount - a.sharedCount)
  }, [directory, party, partyName])

  if (!party) {
    return (
      <div style={{ padding: 24 }}>
        <button onClick={onBack} className="btn-text" style={{ paddingLeft: 0 }}>
          ← Back to directory
        </button>
        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>
          Couldn't find "{partyName}" — they may no longer appear in any project.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%', boxSizing: 'border-box', background: 'var(--bg)' }}>
      <button onClick={onBack} className="btn-text" style={{ marginBottom: 16, paddingLeft: 0 }}>
        ← Back to directory
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22 }}>{party.name}</h2>
        <span className="badge badge-neutral">{party.entityType}</span>
      </div>
      <div style={{ color: 'var(--text-muted)', marginBottom: 22 }}>{party.roles.join(', ')}</div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <Section title="Contact">
            <table style={{ width: '100%', fontSize: 14 }}>
              <tbody>
                <tr>
                  <td style={{ color: 'var(--text-muted)', padding: '6px 12px 6px 0' }}>Phone</td>
                  <td style={{ padding: '6px 0' }}>
                    {party.contactPhone ? <a href={`tel:${party.contactPhone}`}>{party.contactPhone}</a> : '—'}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', padding: '6px 12px 6px 0' }}>Email</td>
                  <td style={{ padding: '6px 0' }}>
                    {party.contactEmail ? <a href={`mailto:${party.contactEmail}`}>{party.contactEmail}</a> : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title={`Worked With (${workedWith.length})`}>
            {workedWith.length === 0 && (
              <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No shared projects with anyone else yet.</div>
            )}
            {workedWith.map((w) => (
              <div
                key={w.name}
                onClick={() => onSelectParty(w.name)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 0',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                    {w.sharedCount} project{w.sharedCount === 1 ? '' : 's'} together
                  </div>
                </div>
                <span style={{ color: 'var(--text-faint)' }}>›</span>
              </div>
            ))}
          </Section>
        </div>

        <div style={{ flex: '2 1 420px', minWidth: 320 }}>
          <Section title={`Projects (${partyProjects.length})`}>
            {partyProjects.map((p) => {
              const color = getTypeColor(p.project_type)
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '13px 0',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {(p.manual_address || p.address) && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                        📍 {p.manual_address || p.address}
                      </div>
                    )}
                    <span className="badge" style={{ backgroundColor: color, marginTop: 7, display: 'inline-block' }}>
                      {getTypeLabel(p.project_type)}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    {formatShortDate(p.last_action_date || p.last_scraped_at)}
                  </span>
                </div>
              )
            })}
          </Section>
        </div>
      </div>
    </div>
  )
}
