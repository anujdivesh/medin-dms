// Shared look for a record's geometry on any map (search map, thumbnails).
export const RESULT_STYLE = {
  color: '#3b82f6',
  weight: 2,
  fillColor: '#3b82f6',
  fillOpacity: 0.08
}

// A single (unclustered) Point geometry; pass to L.divIcon(). Styled as a
// small version of leaflet.markercluster's green cluster bubble so lone
// points and groups of points read as the same thing. Anchored at its centre.
export const POINT_ICON = {
  className: 'record-point',
  html: `<div style="width: 12px; height: 12px; margin: 4px; border-radius: 50%;
    background: rgba(110, 204, 57, 0.95); box-shadow: 0 0 0 4px rgba(181, 226, 140, 0.6);"></div>`,
  iconSize: [20, 20]
}

// Options for L.markerClusterGroup: nearby points merge into a numbered bubble
// (green < 10, yellow < 100, orange 100+) that splits apart as you zoom in.
export const CLUSTER_OPTIONS = {
  showCoverageOnHover: false,
  maxClusterRadius: 50
}
