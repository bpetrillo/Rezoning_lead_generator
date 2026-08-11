import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'

const TYPE_COLORS = {
  Residential: '#f2a900',
  Commercial: '#e53935',
  Industrial: '#8e24aa',
  'Institutional/Public': '#1e88e5',
  Infrastructure: '#26a69a',
  Agricultural: '#43a047',
  'Mixed Use': '#f57c00',
  'Govt. Decisions': '#795548',
}

export default function MapView({ projects, selected, onSelect }) {
  const center = selected
    ? [selected.latitude, selected.longitude]
    : [35.2271, -80.8431] // Charlotte, NC as default center

  return (
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
              color: TYPE_COLORS[p.project_type] ?? '#555',
              fillColor: TYPE_COLORS[p.project_type] ?? '#555',
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
  )
}
