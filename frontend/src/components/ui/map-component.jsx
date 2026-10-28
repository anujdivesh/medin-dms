import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { RESULT_STYLE, POINT_ICON, CLUSTER_OPTIONS } from './map-styles'

// Longitudes from the backend are 0-360 (Tonga ~185, Cook Islands ~202), and
// Leaflet draws them as-is beside this 179°E centre - so geometries are never
// wrapped, split or shifted here; the backend says exactly where to draw.
const DEFAULT_CENTER = [-8, 179.3053]
const DEFAULT_ZOOM = 4

// Fix Leaflet default markers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom SPC Attribution Component
const SPCAttribution = () => {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    // Hide default Leaflet attribution control
    const attributionControl = map.attributionControl
    if (attributionControl) {
      map.removeControl(attributionControl)
    }

    // Create custom SPC attribution
    const spcAttribution = L.control({ position: 'bottomright' })
    spcAttribution.onAdd = function() {
      const div = L.DomUtil.create('div', 'spc-attribution')
      div.style.marginBottom = '1px' 
      div.style.marginRight = '1px'
      div.innerHTML = `
        <div style="display: flex; align-items: center; background: rgba(255, 255, 255, 0.8); padding: 2px 5px; font-size: 11px; color: #333;">
          <img src="https://www.spc.int/sites/default/files/documents/SPC-CPS-logo_27_stars-2023.svg" alt="SPC" style="height: 16px; margin-right: 5px;" />
          <a href="https://www.spc.int/" target="_blank" style="text-decoration: none; color: #333;">SPC</a> | © Pacific Community SPC
        </div>
      `
      return div
    }

    spcAttribution.addTo(map)

    return () => {
      map.removeControl(spcAttribution)
    }
  }, [map])

  return null
}

// Map Controller Component to handle center/zoom changes
const MapController = ({ center, zoom, resetToDefault, defaultCenter, defaultZoom }) => {
  const map = useMap()
  const hasResetRef = useRef(false)

  useEffect(() => {
    if (center && Number.isFinite(zoom)) {
      map.setView([center.lat, center.lng], zoom)
      hasResetRef.current = false
      return
    }

    // When switching back to "All Countries" we intentionally reset the
    // view to the default (do not auto-fit/zoom to result bounds).
    if (resetToDefault && !hasResetRef.current) {
      map.setView(defaultCenter, defaultZoom)
      hasResetRef.current = true
    }
  }, [map, center, zoom, resetToDefault, defaultCenter, defaultZoom])

  useEffect(() => {
    // Leaflet can render blank if the container size changes after mount.
    // Trigger a recalculation on mount and whenever the layout-driving props change.
    const t = setTimeout(() => {
      try {
        map.invalidateSize()
      } catch {
        // ignore
      }
    }, 0)
    return () => clearTimeout(t)
  }, [map, center, zoom])

  return null
}

// Leaflet Draw Controls Component
const LeafletDrawControls = ({ onPolygonDrawn, currentPolygon, onPolygonClick }) => {
  const map = useMap()
  const editableLayersRef = useRef(null)
  const drawControlRef = useRef(null)

  useEffect(() => {
    if (!map) return

    // Create editable layers group
    const editableLayers = new L.FeatureGroup()
    editableLayersRef.current = editableLayers
    map.addLayer(editableLayers)

    // If there's a current polygon, add it to the map
    if (currentPolygon && currentPolygon.length > 0) {
      // Convert from GeoJSON [lng, lat] to Leaflet [lat, lng] for display
      const leafletCoords = currentPolygon.map(coord => [coord[1], coord[0]])
      const polygonLayer = L.polygon(leafletCoords, {
        color: '#2563eb',
        weight: 3,
        fillOpacity: 0.2,
        fillColor: '#3b82f6',
        clickable: true
      })

      if (onPolygonClick) {
        polygonLayer.on('click', () => onPolygonClick(currentPolygon))
      }
      editableLayers.addLayer(polygonLayer)
    }

    // Create draw control
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polyline: false,
        polygon: {
          allowIntersection: false,
          drawError: {
            color: '#e1e100',
            message: '<strong>Oh snap!</strong> you can\'t draw that!'
          },
          shapeOptions: {
            color: '#2563eb',
            weight: 3,
            fillOpacity: 0.2,
            fillColor: '#3b82f6',
            clickable: true
          }
        },
        circle: false,
        circlemarker: false,
        rectangle: false, // Disable rectangle drawing
        marker: false
      },
      edit: {
        featureGroup: editableLayers,
        remove: true,
        edit: {
          selectedPathOptions: {
            color: '#ff0000',
            weight: 3
          }
        }
      }
    })

    drawControlRef.current = drawControl
    map.addControl(drawControl)

    // Handle draw events
    map.on(L.Draw.Event.CREATED, function(e) {
      const layer = e.layer
      
      // Clear existing layers to allow only one shape at a time
      editableLayers.clearLayers()
      
      // Add new layer
      editableLayers.addLayer(layer)
      
      // Extract coordinates and call callback
      if (onPolygonDrawn) {
        let coordinates = null
        
        if (e.layerType === 'polygon') {
          // Get polygon coordinates in GeoJSON format [longitude, latitude]
          const latLngs = layer.getLatLngs()[0]
          coordinates = latLngs.map(latLng => [latLng.lng, latLng.lat])
          // Ensure polygon is closed
          if (coordinates.length > 0 && 
              (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
               coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
            coordinates.push([...coordinates[0]])
          }
        }
        
        onPolygonDrawn(coordinates)

        if (onPolygonClick && coordinates && coordinates.length > 0) {
          layer.on('click', () => onPolygonClick(coordinates))
        }
      }
    })

    // Handle edit and delete events
    map.on(L.Draw.Event.EDITED, function(e) {
      const layers = e.layers
      layers.eachLayer(function(layer) {
        // Update coordinates
        if (onPolygonDrawn) {
          let coordinates = null
          
          if (layer instanceof L.Polygon) {
            // Get polygon coordinates in GeoJSON format [longitude, latitude]
            const latLngs = layer.getLatLngs()[0]
            coordinates = latLngs.map(latLng => [latLng.lng, latLng.lat])
            if (coordinates.length > 0 && 
                (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                 coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
              coordinates.push([...coordinates[0]])
            }
          }
          
          onPolygonDrawn(coordinates)
        }
      })
    })

    map.on(L.Draw.Event.DELETED, function() {
      // console.log('Layers deleted', e)
      if (onPolygonDrawn) {
        onPolygonDrawn(null)
      }
    })

    // Cleanup
    return () => {
      if (drawControlRef.current && map) {
        map.removeControl(drawControlRef.current)
      }
      if (editableLayersRef.current && map) {
        map.removeLayer(editableLayersRef.current)
      }
    }
  }, [map, onPolygonDrawn, currentPolygon, onPolygonClick])

  return null
}

// Map Reset Control Component
const MapResetControl = () => {
  const map = useMap()

  const handleReset = () => {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
  }

  useEffect(() => {
    if (!map) return

    // Create custom reset control
    const resetControl = L.control({ position: 'topright' })
    resetControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      div.style.marginTop = '10px' // Add space below the draw controls
      const button = L.DomUtil.create('a', 'leaflet-bar-part leaflet-bar-part-reset leaflet-control-reset', div)
      button.href = '#'
      button.title = 'Reset Map View'
      button.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: white; border: 2px solid rgba(0,0,0,0.2); border-radius: 4px; text-decoration: none; color: #333; font-weight: bold; font-size: 16px; line-height: 1;'
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-house-icon lucide-map-pin-house">
          <path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z"/>
          <path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2"/>
          <path d="M18 22v-3"/>
          <circle cx="10" cy="10" r="3"/>
        </svg>
      `
      
      // Add click event
      button.addEventListener('click', (e) => {
        e.preventDefault()
        handleReset()
      })
      
      return div
    }

    map.addControl(resetControl)

    return () => {
      map.removeControl(resetControl)
    }
  }, [map])

  return null
}

// Map Satellite Toggle Control Component
const MapSatelliteToggle = () => {
  const map = useMap()
  const [isSatellite, setIsSatellite] = useState(false)

  const handleToggle = () => {
    const newMode = !isSatellite
    setIsSatellite(newMode)
    
    // Remove existing tile layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer)
      }
    })
    
    // Add new tile layer based on mode
    if (newMode) {
      // Satellite imagery from ESRI
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }).addTo(map)
      
      // Add labels layer on top of satellite imagery
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri',
        opacity: 0.8
      }).addTo(map)
    } else {
      // Default OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
      }).addTo(map)
    }
  }

  useEffect(() => {
    if (!map) return

    // Create custom satellite toggle control
    const satelliteControl = L.control({ position: 'topright' })
    satelliteControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      div.style.marginTop = '10px' // Add space below the reset button
      
      const button = L.DomUtil.create('a', 'leaflet-bar-part leaflet-bar-part-satellite leaflet-control-satellite', div)
      button.href = '#'
      button.title = 'Toggle Satellite View'
      button.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: white; border: 2px solid rgba(0,0,0,0.2); border-radius: 4px; text-decoration: none; color: #333; font-weight: bold; font-size: 16px; line-height: 1;'
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      `
      
      // Add click event
      button.addEventListener('click', (e) => {
        e.preventDefault()
        handleToggle()
      })
      
      return div
    }

    map.addControl(satelliteControl)

    return () => {
      map.removeControl(satelliteControl)
    }
  }, [map, isSatellite])

  return null
}

// Default Tile Layer Component
const DefaultTileLayer = () => {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    // Add default OpenStreetMap tile layer
    const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: ''
    })
    defaultLayer.addTo(map)

    return () => {
      map.removeLayer(defaultLayer)
    }
  }, [map])

  return null
}

// Search results, drawn exactly as the backend's GeoJSON geometry says:
// a Polygon as its outline, a Point as a dot - nearby points group into a
// numbered cluster bubble that splits apart as you zoom in.
// Expects features as [{ id, title, geometry }].
const bindResultClick = (layer, result, onClickRef) => {
  layer.on('click', (e) => {
    const cb = onClickRef.current
    if (cb) cb(result, e?.latlng)
  })
}

const ResultsFeaturesLayer = ({ features, onFeatureClick }) => {
  const map = useMap()
  const layerRef = useRef(null)
  const clusterRef = useRef(null)
  const onFeatureClickRef = useRef(onFeatureClick)

  useEffect(() => {
    onFeatureClickRef.current = onFeatureClick
  }, [onFeatureClick])

  useEffect(() => {
    if (!map) return

    const paneName = 'results-features'
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName)
      pane.style.zIndex = 250
    }

    layerRef.current = L.geoJSON(null, {
      pane: paneName,
      style: () => RESULT_STYLE,
      onEachFeature: (feature, layer) => bindResultClick(layer, feature.properties.result, onFeatureClickRef)
    }).addTo(map)

    clusterRef.current = L.markerClusterGroup(CLUSTER_OPTIONS).addTo(map)

    return () => {
      map.removeLayer(layerRef.current)
      map.removeLayer(clusterRef.current)
      layerRef.current = null
      clusterRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!layerRef.current || !clusterRef.current) return

    layerRef.current.clearLayers()
    clusterRef.current.clearLayers()
    const points = []
    ;(Array.isArray(features) ? features : []).forEach((f) => {
      if (!f?.geometry) return
      if (f.geometry.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates || []
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
        const marker = L.marker([lat, lng], { icon: L.divIcon(POINT_ICON), title: f.title || '' })
        bindResultClick(marker, f, onFeatureClickRef)
        points.push(marker)
        return
      }
      try {
        layerRef.current.addData({ type: 'Feature', geometry: f.geometry, properties: { result: f } })
      } catch {
        // skip a malformed geometry rather than break the whole layer
      }
    })
    clusterRef.current.addLayers(points)
  }, [features])

  return null
}

// Points Display Component
const PointsDisplay = ({ coordinates }) => {
  if (!coordinates || coordinates.length === 0) {
    return null
  }

  return (
    <div className="absolute top-20 right-4 z-[1000] bg-popover/95 text-popover-foreground rounded-lg p-3 shadow-lg max-w-xs">
      <div className="font-medium mb-2 text-sm">📍 Selected Points:</div>
      <div className="max-h-32 overflow-y-auto">
        {coordinates.map((coord, index) => (
          <div key={index} className="text-xs text-muted-foreground mb-1">
            Point {index + 1}: {coord[0].toFixed(4)}, {coord[1].toFixed(4)}
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        Total: {coordinates.length} points
      </div>
    </div>
  )
}

const MapComponent = ({ onPolygonDrawn, center, zoom, className = "", currentPolygon, resultFeatures = [], onResultFeatureClick, onPolygonClick }) => {
  const defaultCenter = DEFAULT_CENTER
  const defaultZoom = DEFAULT_ZOOM
  const [currentCoordinates, setCurrentCoordinates] = useState(null)

  const resetToDefault = !center && (!currentPolygon || currentPolygon.length === 0)

  // Handle polygon drawn callback
  const handlePolygonDrawn = (coordinates) => {
    setCurrentCoordinates(coordinates)
    if (onPolygonDrawn) {
      onPolygonDrawn(coordinates)
    }
  }
  
  return (
    <div className={`w-full relative min-h-[320px] ${className}`}>
      <MapContainer
        center={center ? [center.lat, center.lng] : defaultCenter}
        zoom={zoom || defaultZoom}
        className="w-full h-full"
        style={{ minHeight: '320px' }}
        scrollWheelZoom={true}
        worldCopyJump={false}
        doubleClickZoom={false} // Disable double-click zoom to use for polygon completion
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution=''
        />
        
        {/* Add custom SPC attribution */}
        <SPCAttribution />
        
        {/* Add MapController to handle dynamic center/zoom changes */}
        <MapController
          center={center}
          zoom={zoom}
          resetToDefault={resetToDefault}
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
        />

        {/* Add Leaflet Draw Controls */}
        <LeafletDrawControls onPolygonDrawn={handlePolygonDrawn} currentPolygon={currentPolygon} onPolygonClick={onPolygonClick} />

        {/* Draw current results' geometries (points, boxes, polygons) */}
        <ResultsFeaturesLayer features={resultFeatures} onFeatureClick={onResultFeatureClick} />
        
        {/* Add MapResetControl */}
        <MapResetControl />

        {/* Add MapSatelliteToggle */}
        <MapSatelliteToggle />

        {/* Add DefaultTileLayer */}
        <DefaultTileLayer />
      </MapContainer>
      
      {/* Display selected points above search button area */}
      {/* <PointsDisplay coordinates={currentCoordinates} /> */}
      
      {/* Remove the map instructions div */}
      {/* <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 rounded-lg p-3 text-xs text-gray-600 shadow-lg z-[1000]">
        <div className="font-medium mb-1">🗺️ Map Instructions:</div>
        <div>• Use the polygon tool on the right to draw</div>
        <div>• Click to add points for your polygon</div>
        <div>• Double-click to finish the polygon</div>
        <div>• Use edit tools to modify the shape</div>
        <div>• Use delete tool to remove the shape</div>
      </div> */}
    </div>
  )
}

export default MapComponent
