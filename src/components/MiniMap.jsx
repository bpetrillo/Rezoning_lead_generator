import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import { getTypeColor } from '../lib/typeColors.js'

export default function MiniMap({ project }) {
  if (!project.latitude || !project.longitude) {
    return (
      <div
        style={{
          height: 160,
          borderRadius: 8,
          background: '#f2f2f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: 13,
        }}
      >
        No coordinates available for this project
      </div>
    )
  }

  const color = getTypeColor(project.project_type)

  return (
    <div style={{ height: 160, borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer
        center={[project.latitude, project.longitude]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        // A small detail-panel preview doesn't need interaction — keeps it feeling
        // like a static illustration rather than a second full map to accidentally drag.
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker
          center={[project.latitude, project.longitude]}
          radius={8}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}
        />
      </MapContainer>
    </div>
  )
}
