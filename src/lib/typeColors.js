// Single source of truth for project-type colors — imported by MapView, Legend, and
// ProjectList so the map dots, the legend, and the sidebar cards always agree.

export const TYPE_COLORS = {
  Residential: '#f2a900',
  Commercial: '#e53935',
  Industrial: '#8e24aa',
  'Institutional/Public': '#1e88e5',
  Infrastructure: '#26a69a',
  Agricultural: '#43a047',
  'Mixed Use': '#f57c00',
  'Govt. Decisions': '#795548',
}

// Distinct from every category color above and from plain gray — used for projects
// with no classified type (project_type is null), instead of the old flat gray (#555)
// that made "uncategorized" hard to tell apart from "just unstyled."
export const UNCATEGORIZED_COLOR = '#546e7a'

export function getTypeColor(projectType) {
  return TYPE_COLORS[projectType] ?? UNCATEGORIZED_COLOR
}

export function getTypeLabel(projectType) {
  return projectType || 'Uncategorized'
}
