import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import MapView from './components/MapView.jsx'
import FilterBar from './components/FilterBar.jsx'
import ProjectList from './components/ProjectList.jsx'
import ProjectDetail from './components/ProjectDetail.jsx'
import Directory from './components/Directory.jsx'
import PartyDetail from './components/PartyDetail.jsx'
import ProjectsTable from './components/ProjectsTable.jsx'
import { parseAcreageNumber } from './lib/acreage.js'

export default function App() {
  const [view, setView] = useState('map') // 'map' | 'table' | 'directory'
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [selectedParty, setSelectedParty] = useState(null) // name of party being viewed in Directory
  const [filters, setFilters] = useState({
    municipality: 'all',
    projectType: 'all',
    leadStatus: 'all',
    search: '',
    dateFrom: '',
    dateTo: '',
  })

  useEffect(() => {
    let isMounted = true
    async function load() {
      setLoading(true)
      // Supabase caps a single query at 1000 rows regardless of .limit() — the old
      // code here had a hardcoded .limit(500), which silently dropped every row past
      // the 500th once the real dataset grew past that (1399 rows as of writing,
      // across all 7 towns). Paginates through in batches of 1000 instead, same
      // approach already proven working in scripts/export-to-excel.js, so this won't
      // silently truncate again as more data comes in over time.
      const pageSize = 1000
      let from = 0
      const allRows = []
      let fetchError = null

      while (true) {
        const { data, error } = await supabase
          .from('rezoning_projects')
          .select('*')
          .order('last_action_date', { ascending: false })
          .range(from, from + pageSize - 1)

        if (error) {
          fetchError = error
          break
        }
        allRows.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }

      if (!isMounted) return
      if (fetchError) setError(fetchError.message)
      else setProjects(allRows.map((p) => ({ ...p, acreageNumeric: parseAcreageNumber(p.acreage) })))
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
      if (filters.dateFrom && (!p.last_action_date || p.last_action_date < filters.dateFrom)) return false
      if (filters.dateTo && (!p.last_action_date || p.last_action_date > filters.dateTo)) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const haystack = `${p.name} ${p.address} ${p.manual_address} ${p.applicant} ${p.parcel_id}`.toLowerCase()
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

  // Clicking a party in the Directory opens their dedicated profile page (contact info,
  // real "worked with" connections, full project list) rather than just filtering the
  // map — this also handles clicking a name inside "Worked With" to navigate between
  // party profiles directly.
  function handleSelectParty(name) {
    setSelectedParty(name)
  }

  // Clicking a project from within a party's profile jumps to the map with that exact
  // project already open in the detail panel.
  function handleSelectProjectFromParty(project) {
    setView('map')
    setSelected(project)
    setSelectedParty(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0', borderBottom: '1px solid #e2e2e2' }}>
        {['map', 'table', 'directory'].map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v)
              setSelectedParty(null)
            }}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: view === v ? '2px solid #333' : '2px solid transparent',
              background: 'none',
              fontWeight: view === v ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'directory' ? (
        selectedParty ? (
          <PartyDetail
            partyName={selectedParty}
            projects={projects}
            onBack={() => setSelectedParty(null)}
            onSelectProject={handleSelectProjectFromParty}
            onSelectParty={setSelectedParty}
          />
        ) : (
          <Directory projects={projects} onSelectParty={handleSelectParty} />
        )
      ) : (
        <>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            municipalities={municipalities}
            projectTypes={projectTypes}
            leadStatuses={leadStatuses}
            resultCount={filtered.length}
          />
          {view === 'table' ? (
            selected ? (
              <div style={{ flex: 1, overflowY: 'auto', maxWidth: 600 }}>
                <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
              </div>
            ) : (
              <ProjectsTable projects={filtered} onSelectProject={setSelected} />
            )
          ) : (
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1.4, minWidth: 0 }}>
                <MapView projects={filtered} selected={selected} onSelect={setSelected} />
              </div>
              <div style={{ width: 380, borderLeft: '1px solid #e2e2e2', overflowY: 'auto' }}>
                {selected ? (
                  <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
                ) : (
                  <ProjectList projects={filtered} loading={loading} error={error} onSelect={setSelected} />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
