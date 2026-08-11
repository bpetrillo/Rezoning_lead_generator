export default function ProjectDetail({ project: p, onBack }) {
  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={{ marginBottom: 12, cursor: 'pointer' }}>
        ← Back to list
      </button>
      <h2 style={{ margin: '0 0 4px' }}>{p.name}</h2>
      <div style={{ color: '#666', marginBottom: 8 }}>
        {p.status} {p.last_action_date ? `· ${p.last_action_date}` : ''}
      </div>
      <div style={{ marginBottom: 12 }}>
        By <strong>{p.applicant}</strong>
        {p.developer ? (
          <>
            {' '}
            from <strong>{p.developer}</strong>
          </>
        ) : null}
      </div>
      <div style={{ marginBottom: 12 }}>
        📍 {p.address}, {p.municipality}, NC
      </div>
      {p.description ? <p>{p.description}</p> : null}
      <table style={{ width: '100%', fontSize: 13, marginTop: 16 }}>
        <tbody>
          <tr>
            <td style={{ color: '#888', padding: '4px 0' }}>Parcel</td>
            <td>{p.parcel_id}</td>
          </tr>
          <tr>
            <td style={{ color: '#888', padding: '4px 0' }}>Zoning requested</td>
            <td>{p.zoning}</td>
          </tr>
          <tr>
            <td style={{ color: '#888', padding: '4px 0' }}>Coordinates</td>
            <td>
              {p.latitude}, {p.longitude}
            </td>
          </tr>
          <tr>
            <td style={{ color: '#888', padding: '4px 0' }}>Source</td>
            <td>
              {p.source_url ? (
                <a href={p.source_url} target="_blank" rel="noreferrer">
                  View original filing
                </a>
              ) : (
                '—'
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
