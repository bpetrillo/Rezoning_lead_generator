import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import MapView from './components/MapView.jsx'
import FilterBar from './components/FilterBar.jsx'
import ProjectList from './components/ProjectList.jsx'
import ProjectDetail from './components/ProjectDetail.jsx'
import Directory from './components/Directory.jsx'
import PartyDetail from './components/PartyDetail.jsx'
import ProjectsTable from './components/ProjectsTable.jsx'
import Report from './components/Report.jsx'
import { parseAcreageNumber } from './lib/acreage.js'
import { sortByValue, PROJECT_SORT_OPTIONS } from './lib/sort.js'

export default function App() {
  const [view, setView] = useState('map') // 'map' | 'table' | 'report' | 'directory'
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
    sortBy: 'recent',
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

  const sorted = useMemo(() => {
    const option = PROJECT_SORT_OPTIONS.find((o) => o.value === filters.sortBy) || PROJECT_SORT_OPTIONS[0]
    return sortByValue(filtered, option.getValue, option.direction)
  }, [filtered, filters.sortBy])

  // Called by ProjectDetail after it successfully saves lead_status/lead_notes directly
  // to Supabase — keeps the in-memory list (and therefore the sidebar/badges) in sync
  // without needing a full refetch or page refresh.
  function handleProjectUpdate(id, patch) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  // Clicking a party (from the Directory, from within a party's "Worked With" list, or
  // from the Report's "Top Parties" drill-down) opens their dedicated profile page.
  // Always switches to the Directory tab — a no-op if already there, but necessary when
  // called from Report or elsewhere.
  function handleSelectParty(name) {
    setSelectedParty(name)
    setView('directory')
  }

  // Clicking a project from within a party's profile jumps to the map with that exact
  // project already open in the detail panel.
  function handleSelectProjectFromParty(project) {
    setView('map')
    setSelected(project)
    setSelectedParty(null)
  }

  return (
    <div className="app-shell">
      <div className="app-nav">
        {['map', 'table', 'report', 'directory'].map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v)
              setSelectedParty(null)
            }}
            className={`app-nav-tab${view === v ? ' active' : ''}`}
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
            resultCount={sorted.length}
          />
          {view === 'table' ? (
            selected ? (
              <div style={{ flex: 1, overflowY: 'auto', maxWidth: 600, margin: '0 auto', width: '100%' }}>
                <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
              </div>
            ) : (
              <ProjectsTable projects={sorted} onSelectProject={setSelected} />
            )
          ) : view === 'report' ? (
            selected ? (
              <div style={{ flex: 1, overflowY: 'auto', maxWidth: 600, margin: '0 auto', width: '100%' }}>
                <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
              </div>
            ) : (
              <Report projects={sorted} onSelectParty={handleSelectParty} />
            )
          ) : (
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1.4, minWidth: 0 }}>
                <MapView projects={sorted} selected={selected} onSelect={setSelected} />
              </div>
              <div style={{ width: 380, borderLeft: '1px solid var(--border)', overflowY: 'auto' }} className="panel">
                {selected ? (
                  <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={handleProjectUpdate} />
                ) : (
                  <ProjectList projects={sorted} loading={loading} error={error} onSelect={setSelected} />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
