import React, { useEffect, useRef } from 'react'

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

                    if (metadata &&
                        metadata.west_bounding_longitude !== null &&
                        metadata.east_bounding_longitude !== null &&
                        metadata.south_bounding_latitude !== null &&
                        metadata.north_bounding_latitude !== null &&
                        !isNaN(metadata.west_bounding_longitude) &&
                        !isNaN(metadata.east_bounding_longitude) &&
                        !isNaN(metadata.south_bounding_latitude) &&
                        !isNaN(metadata.north_bounding_latitude)) {

                        const bounds = [
                            [metadata.south_bounding_latitude, metadata.west_bounding_longitude],
                            [metadata.north_bounding_latitude, metadata.east_bounding_longitude]
                        ]

                        // Draw bounding box
                        L.rectangle(bounds, {
                            color: '#3b82f6',
                            weight: 2,
                            fillColor: '#3b82f6',
                            fillOpacity: 0.1
                        }).addTo(map)

                        // Add corner markers
                        // const cornerColors = {
                        //   'NW': 'bg-blue-500',
                        //   'NE': 'bg-green-500',
                        //   'SE': 'bg-purple-600',
                        //   'SW': 'bg-orange-500'
                        // }

                        // const corners = [
                        //   { lat: metadata.north_bounding_latitude, lng: metadata.west_bounding_longitude, label: 'NW' },
                        //   { lat: metadata.north_bounding_latitude, lng: metadata.east_bounding_longitude, label: 'NE' },
                        //   { lat: metadata.south_bounding_latitude, lng: metadata.east_bounding_longitude, label: 'SE' },
                        //   { lat: metadata.south_bounding_latitude, lng: metadata.west_bounding_longitude, label: 'SW' }
                        // ]

                        // corners.forEach(corner => {
                        //   const colorClass = cornerColors[corner.label] || 'bg-gray-500'
                        //   L.marker([corner.lat, corner.lng], {
                        //     icon: L.divIcon({
                        //       className: 'corner-marker',
                        //       html: `<div class="${colorClass} text-white text-[10px] px-1 rounded font-bold shadow-sm">${corner.label}</div>`,
                        //       iconSize: [24, 16],
                        //       iconAnchor: [12, 8]
                        //     })
                        //   }).addTo(map)
                        // })


                        map.fitBounds(bounds, { padding: [10, 10] })
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

    const hasValidCoordinates = metadata &&
        metadata.west_bounding_longitude !== null &&
        metadata.east_bounding_longitude !== null &&
        metadata.south_bounding_latitude !== null &&
        metadata.north_bounding_latitude !== null &&
        !isNaN(metadata.west_bounding_longitude) &&
        !isNaN(metadata.east_bounding_longitude) &&
        !isNaN(metadata.south_bounding_latitude) &&
        !isNaN(metadata.north_bounding_latitude)

    if (!hasValidCoordinates) return null

    return (
        <div
            ref={mapRef}
            className="w-full h-full rounded-md border bg-muted/20"
            style={{ minHeight: '120px' }}
        />
    )
}

export default MetadataMapThumbnail
