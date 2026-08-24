/**
 * Sorts items by a derived value, always pushing nulls to the end regardless of
 * direction — a project missing acreage or a date shouldn't jump to the top just
 * because you sorted descending. Shared between ProjectsTable's column-click sort and
 * the toolbar's general "Sort by" control, so both behave identically rather than
 * having two slightly different sort implementations drift apart over time.
 */
export function sortByValue(items, getValue, direction = 'asc') {
  const withValues = items.map((item) => ({ item, v: getValue(item) }))
  withValues.sort((a, b) => {
    if (a.v == null && b.v == null) return 0
    if (a.v == null) return 1
    if (b.v == null) return -1
    if (a.v < b.v) return direction === 'asc' ? -1 : 1
    if (a.v > b.v) return direction === 'asc' ? 1 : -1
    return 0
  })
  return withValues.map((x) => x.item)
}

/** Options for the toolbar's general "Sort by" control (Map/Table/Report views). */
export const PROJECT_SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent activity', getValue: (p) => p.last_action_date, direction: 'desc' },
  { value: 'oldest', label: 'Oldest activity', getValue: (p) => p.last_action_date, direction: 'asc' },
  { value: 'name', label: 'Name (A–Z)', getValue: (p) => p.name, direction: 'asc' },
  { value: 'acreage_desc', label: 'Largest acreage', getValue: (p) => p.acreageNumeric, direction: 'desc' },
  { value: 'acreage_asc', label: 'Smallest acreage', getValue: (p) => p.acreageNumeric, direction: 'asc' },
  { value: 'municipality', label: 'Municipality (A–Z)', getValue: (p) => p.municipality, direction: 'asc' },
]
