import { TYPE_COLORS, UNCATEGORIZED_COLOR } from '../lib/typeColors.js'

const LEGEND_ITEMS = [
  ...Object.entries(TYPE_COLORS).map(([label, color]) => ({ label, color })),
  { label: 'Uncategorized', color: UNCATEGORIZED_COLOR },
]

export default function Legend() {
  return (
    <div
      className="card"
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 1000,
        padding: '12px 14px',
        fontSize: 13,
        lineHeight: 1.8,
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              borderRadius: '50%',
              backgroundColor: item.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--text)' }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
