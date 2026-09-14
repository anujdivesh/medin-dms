// Country bounding boxes for map zooming
// Format: [south, west, north, east] - leaflet bounds format
export const countryBounds = {
  // Major countries with their approximate bounding boxes
  'Afghanistan': [29.3772, 60.5176, 38.4910, 74.8795],
  'Albania': [39.6439, 19.2639, 42.6611, 21.0574],
  'Algeria': [18.9681, -8.6676, 37.0962, 11.9795],
  'Argentina': [-55.0619, -73.5600, -21.7817, -53.6374],
  'Australia': [-43.6345, 113.3389, -10.6681, 153.5697],
  'Austria': [46.3722, 9.5307, 49.0205, 17.1608],
  'Bangladesh': [20.7402, 88.0844, 26.6382, 92.6730],
  'Belgium': [49.4969, 2.5464, 51.5051, 6.4078],
  'Brazil': [-33.7683, -73.9872, 5.2719, -28.6341],
  'Canada': [41.6765, -141.0030, 83.1139, -52.6480],
  'Chile': [-55.9161, -75.6443, -17.4983, -66.4177],
  'China': [18.1979, 73.5577, 53.5609, 134.7754],
  'Colombia': [-4.2270, -81.8317, 12.4373, -66.8511],
  'Denmark': [54.5591, 8.0751, 57.7507, 12.6900],
  'Egypt': [21.9999, 24.6499, 31.6178, 36.8877],
  'Finland': [59.8089, 20.6455, 70.0923, 31.5867],
  'France': [41.3253, -5.1406, 51.1242, 9.5596],
  'Germany': [47.2701, 5.8663, 55.0583, 15.0419],
  'Greece': [34.8020, 19.3736, 41.7488, 29.6499],
  'India': [6.7570, 68.0328, 37.0841, 97.3953],
  'Indonesia': [-10.9355, 95.0106, 5.9047, 141.0194],
  'Iran': [25.0648, 44.0479, 39.7816, 63.3167],
  'Iraq': [29.0695, 38.7923, 37.3852, 48.5679],
  'Italy': [35.4929, 6.6267, 47.0920, 18.5155],
  'Japan': [24.0456, 122.9326, 45.5576, 153.9866],
  'Kenya': [-4.6762, 33.9098, 5.5060, 41.8990],
  'Madagascar': [-25.6071, 43.2541, -11.9453, 50.4765],
  'Mexico': [14.5388, -118.4662, 32.7186, -86.7104],
  'Netherlands': [50.7503, 3.3316, 53.5548, 7.2275],
  'New Zealand': [-52.6194, 165.8055, -29.2315, -175.8319],
  'Norway': [57.9770, 4.6537, 80.7571, 31.2932],
  'Pakistan': [23.6919, 60.8742, 37.0962, 77.8375],
  'Peru': [-18.3479, -81.4109, -0.0572, -68.6651],
  'Philippines': [4.5269, 116.9283, 21.1217, 126.6037],
  'Poland': [49.0020, 14.1229, 54.8394, 24.1458],
  'Russia': [41.1850, -180.0000, 81.8574, 180.0000],
  'Saudi Arabia': [16.3478, 34.4951, 32.1543, 55.6666],
  'South Africa': [-34.8191, 16.3449, -22.1265, 32.8301],
  'Spain': [27.6373, -18.1681, 43.7937, 4.3280],
  'Sweden': [55.3617, 11.0273, 69.0599, 24.1776],
  'Thailand': [5.6129, 97.3758, 20.4178, 105.6394],
  'Turkey': [35.8156, 25.6682, 42.1067, 44.8339],
  'Ukraine': [44.3865, 22.1371, 52.3798, 40.2275],
  'United Kingdom': [49.9599, -8.1821, 60.8447, 1.7627],
  'United States': [24.9493, -125.0011, 49.5904, -66.9326],
  'Venezuela': [0.6475, -73.3049, 12.1623, -59.7582],
  'Vietnam': [8.5596, 102.1700, 23.3528, 109.4697],
  // Pacific Island countries and territories
  'Pitcairn Islands': [-28.5, -133.5, -20.5, -121.0], // converted from 226.5-239.0 longitude
  'Vanuatu': [-21.9, 163.0, -11.9, 173.7],
  'Solomon Islands': [-16.4, 154.5, -4.0, 173.9],
  'Samoa': [-16.0, -174.6, -10.8, -170.4], // converted from 185.4-189.6 longitude
  'Palau': [1.5, 129.0, 12.0, 137.5],
  'Nauru': [-4.0, 163.3, 2.8, 169.7],
  'Fiji': [-25.5, 172.5, -9.5, 184.0], // crosses date line: keep original 184.0
  'Pacific Islands': [-45.0, 110.0, 45.0, -100.0], // converted from 260.0 longitude
  'Tonga': [-26.0, -179.5, -14.0, -171.0], // converted from 180.5-189.0 longitude
  'Federated States of Micronesia': [-1.5, 135.0, 14.0, 166.0],
  'Kiribati': [-14.5, 167.5, 8.5, -146.5], // converted from 213.5 longitude
  'Niue': [-22.9, -172.5, -16.5, -166.0], // converted from 187.5-194.0 longitude
  'Papua New Guinea': [-15.0, 139.0, 3.0, 163.0],
  'Tuvalu': [-13.5, 172.5, -3.5, -176.5], // converted from 183.5 longitude
  'Marshall Islands': [1.6, 157.0, 18.2, 176.0],
  'Cook Islands': [-25.6, -168.8, -5.5, -154.6], // converted from 191.2-205.4 longitude
  'American Samoa': [-17.6, -173.9, -9.9, -165.1], // converted from 186.1-194.9 longitude
  'Wallis and Futuna': [-16.0, 179.4, -9.7, -174.1], // converted from 185.9 longitude
  'New Caledonia': [-26.3, 156.0, -14.7, 170.7],
  'Tokelau': [-11.1, -176.0, -6.3, -167.9], // converted from 184.0-192.1 longitude
  'French Polynesia': [-31.5, -158.6, -4.0, -131.5], // converted from 201.4-228.5 longitude
  'Northern Mariana Islands': [12.0, 141.0, 24.0, 150.0],
  'Guam': [10.0, 141.0, 16.0, 149.0]
}

// Function to get country bounds
export const getCountryBounds = (countryName) => {
  if (!countryName) return null
  
  // Try exact match first
  if (countryBounds[countryName]) {
    return countryBounds[countryName]
  }
  
  // Try case-insensitive partial match
  const normalizedSearch = countryName.toLowerCase()
  const matchedKey = Object.keys(countryBounds).find(key => 
    key.toLowerCase().includes(normalizedSearch) || 
    normalizedSearch.includes(key.toLowerCase())
  )
  
  return matchedKey ? countryBounds[matchedKey] : null
}

// Function to get center coordinates from bounds
export const getCountryCenter = (countryName) => {
  const bounds = getCountryBounds(countryName)
  if (!bounds) return null
  
  const [south, west, north, east] = bounds
  
  // Handle countries that cross the International Date Line (180° meridian)
  // Calculate center longitude robustly, accounting for dateline-crossing bounds.
  // If west > east, the bbox crosses the International Date Line (e.g., west=172.5, east=-176.5)
  let centerLng
  let eastAdjusted = east
  if (west > east) {
    // convert east to 0..360 domain so averaging works (e.g. -176.5 -> 183.5)
    if (east < 0) eastAdjusted = east + 360
    // average in 0..360 space
    const center360 = (west + eastAdjusted) / 2
    // bring back to -180..180
    centerLng = center360 > 180 ? center360 - 360 : center360
  } else {
    centerLng = (west + east) / 2
  }

  // Keep a fixed default zoom to preserve existing UX expectations
  const zoom = 6

  return {
    lat: (south + north) / 2,
    lng: centerLng,
    zoom
  }
}

// Alternative: Use Nominatim geocoding service (slower but more comprehensive)
export const geocodeCountry = async (countryName) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=&q=${encodeURIComponent(countryName)}&limit=1&addressdetails=1`
    )
    const data = await response.json()
    
    if (data.length > 0) {
      const result = data[0]
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        zoom: 6,
        boundingbox: result.boundingbox // [south, north, west, east]
      }
    }
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}
