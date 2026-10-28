import React, { useEffect, useRef } from 'react'
import { RESULT_STYLE, POINT_ICON } from '@/components/ui/map-styles'

const POINT_ZOOM = 8

const MetadataMapThumbnail = ({ metadata }) => {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)

    useEffect(() => {
        const loadLeaflet = async () => {
            try {
                // Import Leaflet CSS if not already present (it likely is from parent, but good safety)
                if (!document.querySelector('link[href*="leaflet"]')) {
                    const link = document.createElement('link')
                    link.rel = 'stylesheet'
                    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
                    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
                    link.crossOrigin = ''
                    document.head.appendChild(link)
                }

                const L = await import('leaflet')

                // Fix icons
                delete L.Icon.Default.prototype._getIconUrl
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
                    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                })

                if (mapRef.current && !mapInstanceRef.current) {
                    // Initialize map with minimal controls
                    const map = L.map(mapRef.current, {
                        attributionControl: false,
                        zoomControl: false,
                        dragging: false,
                        scrollWheelZoom: false,
                        doubleClickZoom: false,
                        boxZoom: false,
                        touchZoom: false
                    }).setView([0, 0], 2)

                    mapInstanceRef.current = map

                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap'
                    }).addTo(map)

                    if (metadata?.geometry) {
                        // Drawn exactly as the backend's GeoJSON says (0-360
                        // longitudes, which Leaflet places correctly as-is).
                        const layer = L.geoJSON(metadata.geometry, {
                            style: () => ({ ...RESULT_STYLE, fillOpacity: 0.1 }),
                            pointToLayer: (feature, latlng) => L.marker(latlng, { icon: L.divIcon(POINT_ICON) })
                        }).addTo(map)

                        if (metadata.geometry.type === 'Point') {
                            // A point has no extent to fit - fitBounds would zoom to street level.
                            const [lng, lat] = metadata.geometry.coordinates
                            map.setView([lat, lng], POINT_ZOOM)
                        } else {
                            map.fitBounds(layer.getBounds(), { padding: [10, 10] })
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading Leaflet for thumbnail:', error)
            }
        }

        loadLeaflet()

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        }
    }, [metadata])

    if (!metadata?.geometry) return null

    return (
        <div
            ref={mapRef}
            className="w-full h-full rounded-md border bg-muted/20"
            style={{ minHeight: '120px' }}
        />
    )
}

export default MetadataMapThumbnail
