import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import MapView from './components/MapView.jsx'
import FilterBar from './components/FilterBar.jsx'
import ProjectList from './components/ProjectList.jsx'
import ProjectDetail from './components/ProjectDetail.jsx'

export default function App() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({
    municipality: 'all',
    projectType: 'all',
    leadStatus: 'all',
    search: '',
  })

  useEffect(() => {
    let isMounted = true
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('rezoning_projects')
        .select('*')
        .order('last_action_date', { ascending: false })
        .limit(500)
      if (!isMounted) return
      if (error) setError(error.message)
      else setProjects(data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  const municipalities = useMemo(
    () => Array.from(new Set(projects.map((p) => p.municipality).filter(Boolean))).sort(),
    [projects]
  )
  const projectTypes = useMemo(
    () => Array.from(new Set(projects.map((p) => p.project_type).filter(Boolean))).sort(),
    [projects]
  )
  const leadStatuses = useMemo(
    () => Array.from(new Set(projects.map((p) => p.lead_status).filter(Boolean))).sort(),
    [projects]
  )

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.municipality !== 'all' && p.municipality !== filters.municipality) return false
      if (filters.projectType !== 'all' && p.project_type !== filters.projectType) return false
      if (filters.leadStatus === 'untracked' && p.lead_status) return false
      if (
        filters.leadStatus !== 'all' &&
        filters.leadStatus !== 'untracked' &&
        p.lead_status !== filters.leadStatus
      )
        return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const haystack = `${p.name} ${p.address} ${p.applicant} ${p.parcel_id}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [projects, filters])

  // Called by ProjectDetail after it successfully saves lead_status/lead_notes directly
  // to Supabase — keeps the in-memory list (and therefore the sidebar/badges) in sync
  // without needing a full refetch or page refresh.
  function handleProjectUpdate(id, patch) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        municipalities={municipalities}
        projectTypes={projectTypes}
        leadStatuses={leadStatuses}
        resultCount={filtered.length}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1.4, minWidth: 0 }}>
          <MapView projects={filtered} selected={selected} onSelect={setSelected} />
        </div>
        <div style={{ width: 380, borderLeft: '1px solid #e2e2e2', overflowY: 'auto' }}>
          {selected ? (
            <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
          ) : (
            <ProjectList
              projects={filtered}
              loading={loading}
              error={error}
              onSelect={setSelected}
            />
          )}
        </div>
      </div>
    </div>
  )
}
