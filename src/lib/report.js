import { getTypeColor, getTypeLabel } from './typeColors.js'
import { getLeadStatusColor } from './leadStatus.js'

// Generic color cycle for dimensions that don't have their own established color
// scheme elsewhere in the app (Municipality, Status, Project Size buckets).
const GENERIC_PALETTE = [
  '#1e88e5', '#e53935', '#43a047', '#f57c00', '#8e24aa',
  '#00897b', '#c0ca33', '#6d4c41', '#546e7a', '#d81b60',
]

function colorForIndex(i) {
  return GENERIC_PALETTE[i % GENERIC_PALETTE.length]
}

/**
 * Groups projects by whatever getKey() returns, counts each group, and computes
 * percentage of the given total. Returns entries sorted by count descending, unless a
 * custom sort is passed in (used for Project Size, where buckets should read in size
 * order, not popularity order).
 */
export function computeBreakdown(projects, { getKey, getColor, sort } = {}) {
  const counts = new Map()
  for (const p of projects) {
    const key = getKey(p)
    if (key == null) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const total = projects.length
  let entries = Array.from(counts.entries()).map(([key, count], i) => ({
    key,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
    color: getColor ? getColor(key, i) : colorForIndex(i),
  }))
  entries = sort ? sort(entries) : entries.sort((a, b) => b.count - a.count)
  return entries
}

export function projectCategoryBreakdown(projects) {
  return computeBreakdown(projects, {
    getKey: (p) => getTypeLabel(p.project_type),
    getColor: (key) => getTypeColor(key === 'Uncategorized' ? null : key),
  })
}

export function municipalityBreakdown(projects) {
  return computeBreakdown(projects, { getKey: (p) => p.municipality })
}

export function statusBreakdown(projects) {
  return computeBreakdown(projects, { getKey: (p) => p.status })
}

export function pipelineBreakdown(projects) {
  return computeBreakdown(projects, {
    getKey: (p) => p.lead_status || 'Not tracked',
    getColor: (key) => (key === 'Not tracked' ? '#ccc' : getLeadStatusColor(key)),
  })
}

const SIZE_BUCKETS = [
  { label: '< 1 acre', max: 1 },
  { label: '1–5 acres', max: 5 },
  { label: '5–10 acres', max: 10 },
  { label: '10–25 acres', max: 25 },
  { label: '25+ acres', max: Infinity },
]

function acreageBucketLabel(acreageNumeric) {
  if (acreageNumeric == null) return null
  const bucket = SIZE_BUCKETS.find((b) => acreageNumeric < b.max)
  return bucket ? bucket.label : null
}

export function getSizeLabel(p) {
  return acreageBucketLabel(p.acreageNumeric)
}

export function getCategoryLabel(p) {
  return getTypeLabel(p.project_type)
}

export function projectSizeBreakdown(projects) {
  const order = SIZE_BUCKETS.map((b) => b.label)
  return computeBreakdown(projects, {
    getKey: (p) => acreageBucketLabel(p.acreageNumeric),
    // Sorted in size order (smallest to largest), not by popularity — reading a size
    // breakdown sorted by count would be confusing (buckets jumping around).
    sort: (entries) => entries.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)),
  })
}
