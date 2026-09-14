import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'

const DEFAULT_CENTER = [-8, 179.3053]
const DEFAULT_ZOOM = 4

const wrap360 = (lng) => {
  const n = typeof lng === 'number' ? lng : parseFloat(lng)
  if (!Number.isFinite(n)) return NaN
  return ((n % 360) + 360) % 360
}

// Choose a cut line that avoids the densest cluster, producing the smallest
// longitudinal span when boxes are near the antimeridian.
const computeBestCut = (angles360) => {
  const vals = (angles360 || []).filter(Number.isFinite)
  if (vals.length === 0) return 0
  vals.sort((a, b) => a - b)

  let maxGap = -1
  let bestStart = vals[0]
  for (let i = 0; i < vals.length; i++) {
    const curr = vals[i]
    const next = (i === vals.length - 1) ? (vals[0] + 360) : vals[i + 1]
    const gap = next - curr
    if (gap > maxGap) {
      maxGap = gap
      // minimal covering arc starts at the element AFTER the largest gap
      bestStart = (i === vals.length - 1) ? vals[0] : vals[i + 1]
    }
  }
  return bestStart
}

const computeCutForBoxes = (boxes) => {
  const endpoints360 = []
  const list = Array.isArray(boxes) ? boxes : []
  for (const b of list) {
    if (!b || !b.bounds || b.bounds.length !== 2) continue
    const [[south, west], [north, east]] = b.bounds
    if (!Number.isFinite(south) || !Number.isFinite(north)) continue
    const w = wrap360(west)
    const e = wrap360(east)
    if (!Number.isFinite(w) || !Number.isFinite(e)) continue
    endpoints360.push(w, e)
  }
  return computeBestCut(endpoints360)
}

const unwrapBoundsRelativeToCut = (bounds, cut) => {
  if (!bounds || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  if (!Number.isFinite(south) || !Number.isFinite(north)) return null

  let w = wrap360(west)
  let e = wrap360(east)
  if (!Number.isFinite(w) || !Number.isFinite(e)) return null

  // Unwrap into a continuous range starting at `cut`
  if (w < cut) w += 360
  if (e < cut) e += 360
  if (e < w) e += 360

  return [[south, w], [north, e]]
}

const wrap180 = (lng) => {
  const n = typeof lng === 'number' ? lng : parseFloat(lng)
  if (!Number.isFinite(n)) return NaN
  const x = ((n + 180) % 360 + 360) % 360
  return x - 180
}

// Normalize a bbox into Leaflet-friendly bounds in [-180, 180] and split if it
// crosses the antimeridian. Returns an array of bounds (1 or 2 items).
const normalizeAndSplitBounds180 = (bounds) => {
  if (!bounds || bounds.length !== 2) return []
  const [[southRaw, westRaw], [northRaw, eastRaw]] = bounds

  const south = Math.min(90, Math.max(-90, typeof southRaw === 'number' ? southRaw : parseFloat(southRaw)))
  const north = Math.min(90, Math.max(-90, typeof northRaw === 'number' ? northRaw : parseFloat(northRaw)))
  let west = wrap180(westRaw)
  let east = wrap180(eastRaw)
  if (![south, north, west, east].every(Number.isFinite)) return []

  // If encoded as an almost-worldwide span (e.g. -170..170), prefer the short
  // span across the dateline.
  const span = east - west
  if (Number.isFinite(span) && span > 180) {
    const tmp = west
    west = east
    east = tmp
  }

  if (west > east) {
    return [
      [[south, west], [north, 180]],
      [[south, -180], [north, east]]
    ]
  }

  return [
    [[south, west], [north, east]]
  ]
}

// Fix Leaflet default markers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
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

// Search Results Bounding Boxes Layer
// Expects bounds in Leaflet format: [[southLat, westLng], [northLat, eastLng]]
const ResultsBoundingBoxesLayer = ({ boxes, onBoxClick, cut, unwrap, referenceLng }) => {
  const map = useMap()
  const layerRef = useRef(null)
  const onBoxClickRef = useRef(onBoxClick)
  const [effectiveRefLng, setEffectiveRefLng] = useState(referenceLng)
  const lastWrappedCenterRef = useRef(null)
  const unwrappedCenterRef = useRef(referenceLng)

  useEffect(() => {
    onBoxClickRef.current = onBoxClick
  }, [onBoxClick])

  useEffect(() => {
    // When the parent changes referenceLng (e.g. user selects a country), snap to it.
    setEffectiveRefLng(referenceLng)
    const wrapped = wrap180(referenceLng)
    lastWrappedCenterRef.current = Number.isFinite(wrapped) ? wrapped : null
    unwrappedCenterRef.current = Number.isFinite(referenceLng) ? referenceLng : wrapped
  }, [referenceLng])

  useEffect(() => {
    if (!map) return

    const paneName = 'results-bboxes'
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName)
      pane.style.zIndex = 250
    }

    if (!layerRef.current) {
      layerRef.current = L.featureGroup()
      layerRef.current.addTo(map)
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map])

  useEffect(() => {
    if (!map) return

    // After user pans/zooms (including worldCopyJump wraps), re-anchor the
    // bbox shifting so we don't "lose" half the dateline boxes.
    const onMoveEnd = () => {
      try {
        const wrapped = wrap180(map.getCenter()?.lng)
        if (!Number.isFinite(wrapped)) return

        const prevWrapped = lastWrappedCenterRef.current
        if (!Number.isFinite(prevWrapped)) {
          lastWrappedCenterRef.current = wrapped
          unwrappedCenterRef.current = wrapped
          setEffectiveRefLng(wrapped)
          return
        }

        // Track an unwrapped longitude so boxes remain visible even if the
        // user pans into another world copy (Leaflet wraps getCenter().lng).
        let delta = wrapped - prevWrapped
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360

        const base = Number.isFinite(unwrappedCenterRef.current) ? unwrappedCenterRef.current : prevWrapped
        const nextUnwrapped = base + delta

        lastWrappedCenterRef.current = wrapped
        unwrappedCenterRef.current = nextUnwrapped
        setEffectiveRefLng(nextUnwrapped)
      } catch {
        // ignore
      }
    }

    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [map])

  useEffect(() => {
    if (!map || !layerRef.current) return

    const paneName = 'results-bboxes'
    layerRef.current.clearLayers()

    const ref = (typeof effectiveRefLng === 'number' && Number.isFinite(effectiveRefLng))
      ? effectiveRefLng
      : wrap180(effectiveRefLng)

    const list = Array.isArray(boxes) ? boxes : []
    list.forEach((b) => {
      if (!b || !b.bounds || b.bounds.length !== 2) return

      const boundsList = unwrap
        ? (() => {
          // Keep rectangles in the same world copy that auto-fit uses.
          const unwrapped = unwrapBoundsRelativeToCut(b.bounds, Number.isFinite(cut) ? cut : 0)
          return unwrapped ? [unwrapped] : []
        })()
        : normalizeAndSplitBounds180(b.bounds)

      boundsList.forEach((bounds) => {
        // If the bbox was split at the antimeridian, Leaflet will render the two
        // parts on opposite sides of the world. Shift by ±360° so parts stay
        // near the reference longitude (default center or selected country).
        let renderBounds = bounds
        if (Number.isFinite(ref)) {
          const [[south, west], [north, east]] = bounds
          const midLng = (west + east) / 2
          let shift = 0
          let delta = midLng - ref
          while (delta < -180) {
            shift += 360
            delta += 360
          }
          while (delta > 180) {
            shift -= 360
            delta -= 360
          }
          if (shift !== 0) {
            renderBounds = [[south, west + shift], [north, east + shift]]
          }
        }

        const rect = L.rectangle(renderBounds, {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          pane: paneName
        })

        rect.on('click', (e) => {
          const cb = onBoxClickRef.current
          if (cb) cb(b, e?.latlng)
        })

        rect.addTo(layerRef.current)
      })
    })
  }, [map, boxes, cut, unwrap, effectiveRefLng])

  return null
}

// Auto-fit map to show all current result bounding boxes (used for "All Countries")
const ResultsFitBoundsController = ({ boxes, enabled, cut }) => {
  const map = useMap()

  useEffect(() => {
    if (!map || !enabled) return

    const list = Array.isArray(boxes) ? boxes : []
    if (list.length === 0) return

    // Collect endpoints for cut selection
    const endpoints360 = []
    for (const b of list) {
      if (!b || !b.bounds || b.bounds.length !== 2) continue
      const [[south, west], [north, east]] = b.bounds
      if (!Number.isFinite(south) || !Number.isFinite(north) || !Number.isFinite(west) || !Number.isFinite(east)) continue
      endpoints360.push(wrap360(west), wrap360(east))
    }

    if (endpoints360.length === 0) return

    const chosenCut = Number.isFinite(cut) ? cut : computeBestCut(endpoints360)

    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity

    for (const b of list) {
      if (!b || !b.bounds || b.bounds.length !== 2) continue
      const [[south, west], [north, east]] = b.bounds
      if (!Number.isFinite(south) || !Number.isFinite(north) || !Number.isFinite(west) || !Number.isFinite(east)) continue

      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)

      let w = wrap360(west)
      let e = wrap360(east)
      if (w < chosenCut) w += 360
      if (e < chosenCut) e += 360
      if (e < w) e += 360

      minLng = Math.min(minLng, w)
      maxLng = Math.max(maxLng, e)
    }

    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLng)) return

    // Avoid trying to fit an almost-worldwide span; keep current view instead.
    if (maxLng - minLng > 350) return

    const combined = L.latLngBounds([[minLat, minLng], [maxLat, maxLng]])
    if (!combined.isValid()) return

    map.fitBounds(combined, {
      padding: [20, 20],
      animate: true
    })
  }, [map, boxes, enabled, cut])

  return null
}

// Points Display Component
const PointsDisplay = ({ coordinates }) => {
  if (!coordinates || coordinates.length === 0) {
    return null
  }

  return (
    <div className="absolute top-20 right-4 z-[1000] bg-white bg-opacity-95 rounded-lg p-3 shadow-lg max-w-xs">
      <div className="font-medium mb-2 text-sm text-gray-700">📍 Selected Points:</div>
      <div className="max-h-32 overflow-y-auto">
        {coordinates.map((coord, index) => (
          <div key={index} className="text-xs text-gray-600 mb-1">
            Point {index + 1}: {coord[0].toFixed(4)}, {coord[1].toFixed(4)}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Total: {coordinates.length} points
      </div>
    </div>
  )
}

const MapComponent = ({ onPolygonDrawn, center, zoom, className = "", currentPolygon, resultBoxes = [], onResultBoxClick, onPolygonClick }) => {
  const defaultCenter = DEFAULT_CENTER
  const defaultZoom = DEFAULT_ZOOM
  const [currentCoordinates, setCurrentCoordinates] = useState(null)

  const resetToDefault = !center && (!currentPolygon || currentPolygon.length === 0)

  // UX requirement: never auto-zoom/fit to results when "All Countries" is selected.
  const autoFitEnabled = false
  const resultsCut = React.useMemo(() => computeCutForBoxes(resultBoxes), [resultBoxes])
  const referenceLng = center?.lng ?? defaultCenter[1]
  
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
        scrollWheelZoom={false}
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

        {/* If no explicit center/polygon, auto-fit to show all result boxes */}
        <ResultsFitBoundsController
          boxes={resultBoxes}
          enabled={autoFitEnabled}
          cut={resultsCut}
        />
        
        {/* Add Leaflet Draw Controls */}
        <LeafletDrawControls onPolygonDrawn={handlePolygonDrawn} currentPolygon={currentPolygon} onPolygonClick={onPolygonClick} />

        {/* Draw bounding boxes for current results */}
        <ResultsBoundingBoxesLayer boxes={resultBoxes} onBoxClick={onResultBoxClick} cut={resultsCut} unwrap={autoFitEnabled} referenceLng={referenceLng} />
        
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
