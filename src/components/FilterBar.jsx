export default function FilterBar({
  filters,
  setFilters,
  municipalities,
  projectTypes,
  leadStatuses,
  resultCount,
}) {
  return (
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
        placeholder="Search places, projects, parcels..."
        value={filters.search}
        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      />
      <select
        value={filters.municipality}
        onChange={(e) => setFilters((f) => ({ ...f, municipality: e.target.value }))}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      >
        <option value="all">All municipalities</option>
        {municipalities.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={filters.projectType}
        onChange={(e) => setFilters((f) => ({ ...f, projectType: e.target.value }))}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      >
        <option value="all">All types</option>
        {projectTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={filters.leadStatus}
        onChange={(e) => setFilters((f) => ({ ...f, leadStatus: e.target.value }))}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      >
        <option value="all">My pipeline: all</option>
        <option value="untracked">Not tracked yet</option>
        {leadStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span style={{ color: '#666', fontSize: 14, whiteSpace: 'nowrap' }}>{resultCount} projects</span>
    </div>
  )
}
