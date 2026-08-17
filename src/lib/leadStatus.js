// Personal pipeline tracking — set by you in the app, separate from the town's own
// official `status` field (Approved, Pending, etc.). Shared here so the dropdown in
// ProjectDetail and any badge in ProjectList stay in sync.

export const LEAD_STATUSES = [
  { value: '', label: 'Not tracked' },
  { value: 'Contacted', label: 'Contacted', color: '#1e88e5' },
  { value: 'Interested', label: 'Interested', color: '#43a047' },
  { value: 'Follow Up', label: 'Follow Up', color: '#f57c00' },
  { value: 'Client', label: 'Client', color: '#8e24aa' },
]

export function getLeadStatusColor(leadStatus) {
  return LEAD_STATUSES.find((s) => s.value === leadStatus)?.color ?? null
}
