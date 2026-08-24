import { PROJECT_SORT_OPTIONS } from '../lib/sort.js'

export default function FilterBar({
  filters,
  setFilters,
  municipalities,
  projectTypes,
  leadStatuses,
  resultCount,
}) {
  return (
    <div className="toolbar">
      <input
        className="input"
        placeholder="Search places, projects, parcels..."
        value={filters.search}
        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        style={{ flex: 1, minWidth: 180 }}
      />
      <select
        className="select"
        value={filters.municipality}
        onChange={(e) => setFilters((f) => ({ ...f, municipality: e.target.value }))}
      >
        <option value="all">All municipalities</option>
        {municipalities.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={filters.projectType}
        onChange={(e) => setFilters((f) => ({ ...f, projectType: e.target.value }))}
      >
        <option value="all">All types</option>
        {projectTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={filters.leadStatus}
        onChange={(e) => setFilters((f) => ({ ...f, leadStatus: e.target.value }))}
      >
        <option value="all">My pipeline: all</option>
        <option value="untracked">Not tracked yet</option>
        {leadStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last action:</label>
        <input
          className="input"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          style={{ padding: '9px 10px' }}
        />
        <span style={{ color: 'var(--text-faint)' }}>–</span>
        <input
          className="input"
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          style={{ padding: '9px 10px' }}
        />
        {(filters.dateFrom || filters.dateTo) && (
          <button className="btn" onClick={() => setFilters((f) => ({ ...f, dateFrom: '', dateTo: '' }))}>
            Clear
          </button>
        )}
      </div>
      <select
        className="select"
        value={filters.sortBy}
        onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}
      >
        {PROJECT_SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
      <span style={{ color: 'var(--text-muted)', fontSize: 14, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
        {resultCount.toLocaleString()} projects
      </span>
    </div>
  )
}
