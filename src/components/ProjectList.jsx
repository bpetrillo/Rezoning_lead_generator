export default function ProjectList({ projects, loading, error, onSelect }) {
  if (loading) return <div style={{ padding: 16 }}>Loading projects...</div>
  if (error) return <div style={{ padding: 16, color: '#c00' }}>Error: {error}</div>
  if (projects.length === 0) return <div style={{ padding: 16, color: '#666' }}>No projects match these filters.</div>

  return (
    <div>
      {projects.map((p) => (
        <div
          key={p.id}
          onClick={() => onSelect(p)}
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontSize: 13, color: '#666' }}>
            {p.municipality} · {p.address}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {p.status} {p.last_action_date ? `· ${p.last_action_date}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
