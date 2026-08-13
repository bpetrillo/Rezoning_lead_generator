import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import Legend from './Legend.jsx'
import { getTypeColor } from '../lib/typeColors.js'

export default function MapView({ projects, selected, onSelect }) {
  const center = selected
    ? [selected.latitude, selected.longitude]
    : [35.2271, -80.8431] // Charlotte, NC as default center

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={selected ? 15 : 10} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {projects
          .filter((p) => p.latitude && p.longitude)
          .map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={selected?.id === p.id ? 9 : 6}
              pathOptions={{
                color: getTypeColor(p.project_type),
                fillColor: getTypeColor(p.project_type),
                fillOpacity: 0.85,
              }}
              eventHandlers={{ click: () => onSelect(p) }}
            >
              <Popup>
                <strong>{p.name}</strong>
                <br />
                {p.address}
                <br />
                {p.status}
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>
      <Legend />
    </div>
  )
}
