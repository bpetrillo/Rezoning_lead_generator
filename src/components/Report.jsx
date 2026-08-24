import { useMemo, useState } from 'react'
import {
  projectCategoryBreakdown,
  municipalityBreakdown,
  applicationTypeBreakdown,
  pipelineBreakdown,
  projectSizeBreakdown,
  computeBreakdown,
  getCategoryLabel,
  getSizeLabel,
} from '../lib/report.js'
import { classifyAssetClass } from '../lib/assetClass.js'
import { buildDirectory } from '../lib/directory.js'

function PieChart({ segments, size = 120 }) {
  let cursor = 0
  const stops = segments
    .map((s) => {
      const start = cursor
      cursor += s.pct
      return `${s.color} ${start}% ${cursor}%`
    })
    .join(', ')
  const background = segments.length ? `conic-gradient(${stops})` : '#eee'
  return <div style={{ width: size, height: size, borderRadius: '50%', background, flexShrink: 0 }} />
}

function BreakdownSection({ title, segments, dimension, activeFilter, onSelect, showPie }) {
  const isActiveDimension = activeFilter?.dimension === dimension
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14, color: '#222' }}>{title}</div>
      {isActiveDimension && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            background: '#f2f2f2',
            borderRadius: 20,
            padding: '4px 12px',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: segments.find((s) => s.key === activeFilter.value)?.color,
            }}
          />
          <span>
            Filtered: <strong>{activeFilter.value}</strong>
          </span>
          <button
            onClick={() => onSelect(dimension, null)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666', fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {showPie && <PieChart segments={segments} />}
        <div style={{ flex: 1, minWidth: 260 }}>
          {segments.map((s) => {
            const isActive = isActiveDimension && activeFilter.value === s.key
            const isDimmed = isActiveDimension && !isActive
            return (
              <div
                key={s.key}
                onClick={() => onSelect(dimension, isActive ? null : s.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.4 : 1,
                }}
              >
                <span style={{ width: 10, height: 10, background: s.color, borderRadius: 3, flexShrink: 0 }} />
                <span style={{ width: 150, flexShrink: 0, fontSize: 14, fontWeight: isActive ? 700 : 400 }}>
                  {s.key}
                </span>
                <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: s.color }} />
                </div>
                <span style={{ width: 32, textAlign: 'right', fontWeight: 600, fontSize: 14 }}>{s.count}</span>
                <span style={{ width: 40, textAlign: 'right', color: '#999', fontSize: 12 }}>{s.pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Report({ projects, onSelectParty }) {
  // Single active cross-filter at a time (dimension + value), applied across every
  // section on the page — clicking a segment filters everything else, matching the
  // Boardwalk reference. Clicking the same segment again (or the ✕) clears it.
  const [activeFilter, setActiveFilter] = useState(null)

  function handleSelect(dimension, value) {
    setActiveFilter(value == null ? null : { dimension, value })
  }

  const filtered = useMemo(() => {
    if (!activeFilter) return projects
    const { dimension, value } = activeFilter
    return projects.filter((p) => {
      if (dimension === 'category') return getCategoryLabel(p) === value
      if (dimension === 'municipality') return p.municipality === value
      if (dimension === 'applicationType') return (p.request_type || 'Not specified') === value
      if (dimension === 'pipeline') return (p.lead_status || 'Not tracked') === value
      if (dimension === 'size') return getSizeLabel(p) === value
      return true
    })
  }, [projects, activeFilter])

  const categorySegments = useMemo(() => projectCategoryBreakdown(filtered), [filtered])
  const municipalitySegments = useMemo(() => municipalityBreakdown(filtered), [filtered])
  const applicationTypeSegments = useMemo(() => applicationTypeBreakdown(filtered), [filtered])
  const pipelineSegments = useMemo(() => pipelineBreakdown(filtered), [filtered])
  const sizeSegments = useMemo(() => projectSizeBreakdown(filtered), [filtered])

  // Asset Class drill-down — only shown when filtered by Project Category, matching
  // the Boardwalk reference exactly (image 3: filtering "Commercial" reveals an
  // "Asset Class — Commercial" breakdown right below it). Heuristic, same as the
  // category classifier itself — see src/lib/assetClass.js for the full reasoning and
  // real test cases it was validated against.
  const assetClassSegments = useMemo(() => {
    if (activeFilter?.dimension !== 'category') return []
    return computeBreakdown(filtered, {
      getKey: (p) => classifyAssetClass(activeFilter.value, { description: p.description }),
    })
  }, [filtered, activeFilter])

  // Drill-down detail, shown only when a filter is active — top parties within the
  // filtered subset. This substitutes for Boardwalk's "Asset Class" sub-taxonomy
  // drill-down, which needs data (property/asset subtype) that isn't in our scrapers
  // for any town — top parties is a real, useful equivalent built from data we
  // actually have.
  const topParties = useMemo(() => {
    if (!activeFilter) return []
    return buildDirectory(filtered)
      .sort((a, b) => b.projectCount - a.projectCount)
      .slice(0, 8)
  }, [filtered, activeFilter])

  const missingSizeCount = filtered.filter((p) => p.acreageNumeric == null).length

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%', boxSizing: 'border-box', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        {filtered.length.toLocaleString()} Projects {activeFilter ? 'In Filtered View' : 'In View'}
      </div>
      <div style={{ color: '#888', fontSize: 13, marginBottom: 28 }}>
        Click any category, municipality, status, pipeline stage, or size range below to filter the whole report to
        just that slice.
      </div>

      <BreakdownSection
        title="Project Category"
        segments={categorySegments}
        dimension="category"
        activeFilter={activeFilter}
        onSelect={handleSelect}
        showPie
      />

      {activeFilter?.dimension === 'category' && assetClassSegments.length > 0 && (
        <BreakdownSection
          title={`Asset Class — ${activeFilter.value}`}
          segments={assetClassSegments}
          dimension="assetClass"
          activeFilter={null}
          onSelect={() => {}}
        />
      )}

      <BreakdownSection
        title="Municipality"
        segments={municipalitySegments}
        dimension="municipality"
        activeFilter={activeFilter}
        onSelect={handleSelect}
        showPie
      />

      <BreakdownSection
        title="Application Type"
        segments={applicationTypeSegments}
        dimension="applicationType"
        activeFilter={activeFilter}
        onSelect={handleSelect}
      />

      <BreakdownSection
        title="My Pipeline"
        segments={pipelineSegments}
        dimension="pipeline"
        activeFilter={activeFilter}
        onSelect={handleSelect}
      />

      <div style={{ marginBottom: 32 }}>
        <BreakdownSection
          title="Project Size"
          segments={sizeSegments}
          dimension="size"
          activeFilter={activeFilter}
          onSelect={handleSelect}
        />
        {missingSizeCount > 0 && (
          <div style={{ color: '#999', fontSize: 13, fontStyle: 'italic', marginTop: -20 }}>
            + {missingSizeCount} project{missingSizeCount === 1 ? '' : 's'} with unknown size
          </div>
        )}
      </div>

      {activeFilter && topParties.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14, color: '#222' }}>
            Top Parties in This View
          </div>
          {topParties.map((party) => (
            <div
              key={party.name}
              onClick={() => onSelectParty?.(party.name)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid #f0f0f0',
                cursor: onSelectParty ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontWeight: 600 }}>{party.name}</span>
              <span style={{ color: '#888', fontSize: 13 }}>
                {party.projectCount} project{party.projectCount === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
