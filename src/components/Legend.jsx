import { TYPE_COLORS, UNCATEGORIZED_COLOR } from '../lib/typeColors.js'

const LEGEND_ITEMS = [
  ...Object.entries(TYPE_COLORS).map(([label, color]) => ({ label, color })),
  { label: 'Uncategorized', color: UNCATEGORIZED_COLOR },
]

export default function Legend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 1000,
        background: 'white',
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: item.color,
              flexShrink: 0,
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
