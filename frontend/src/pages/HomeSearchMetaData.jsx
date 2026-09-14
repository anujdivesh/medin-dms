import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { TourStep } from '@/components/guided-tour'
import { Search } from 'lucide-react'
import { API_ENDPOINTS } from '@/config/apiEndpoints'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, X, MapPin, HelpCircle, PenTool } from 'lucide-react'
import { elasticsearchService } from '@/lib/elasticsearchService'

import MapComponent from '@/components/ui/map-component'
import { getCountryCenter } from '@/utils/countryCoordinates'
import RequestDataButton from '@/components/RequestDataButton'
import MetadataMapThumbnail from '@/components/Metadata/MetadataMapThumbnail'
import RequestMultipleDataButton from '@/components/RequestMultipleDataButton'
import { Checkbox } from '@/components/ui/checkbox'

// Helper: Title Case for display only (keep original value for filters)
const toTitleCase = (str) => {
  if (!str || typeof str !== 'string') return str
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Helper: Hash string to a colorful badge class
const getBadgeColor = (str) => {
  const colors = [
    'bg-red-100 text-red-800 border-red-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200',
    'bg-amber-100 text-amber-800 border-amber-200',
  ]
  if (!str || str === 'Unknown') return 'bg-gray-100 text-gray-800 border-gray-200'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Searchable Select Component
const SearchableSelect = ({ value, onValueChange, placeholder, options, id, isRequired = false, contentClassName = "", showGenericAllOption = true }) => {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  // Normalize and trim all option values and labels
  const normalizedOptions = React.useMemo(() => {
    return (options || [])
      .map((opt) => {
        if (opt == null) return null
        if (typeof opt === 'string') {
          const v = opt.trim()
          return { value: v, label: v, display: toTitleCase(v) }
        }
        const valueStr = String(opt.value ?? opt.id ?? '').trim()
        const labelStr = String(opt.label ?? opt.value ?? '').trim()
        if (!valueStr) return null
        return { value: valueStr, label: labelStr, display: labelStr }
      })
      .filter(Boolean)
  }, [options])

  // Always trim the selected value for comparison
  const trimmedValue = typeof value === 'string' ? value.trim() : value

  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return normalizedOptions
    return normalizedOptions.filter(option =>
      option.label.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [normalizedOptions, searchValue])

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen)
    if (!newOpen) {
      setSearchValue('')
    }
  }

  return (
    <Select value={trimmedValue} onValueChange={val => onValueChange(val && typeof val === 'string' ? val.trim() : val)} open={open} onOpenChange={handleOpenChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} className="truncate" />
      </SelectTrigger>
      <SelectContent className={`max-w-[300px] ${contentClassName}`}>
        {/* Search Input */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>

        {/* Options */}
        {!isRequired && showGenericAllOption && (
          <SelectItem value="all" className="truncate">
            {placeholder === 'All' || !placeholder ? 'All' : `All ${placeholder}s`}
          </SelectItem>
        )}
        {filteredOptions.length === 0 ? (
          <div className="p-2 text-center text-sm text-muted-foreground">
            {searchValue ? "No options match your search." : "No options found."}
          </div>
        ) : (
          filteredOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="truncate" title={opt.display}>
              <span className="truncate block max-w-full">{opt.display}</span>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

function HomeSearchMetaData() {
  const [filters, setFilters] = useState({
    title: '',
    country: 'All Countries',
    spatial_representation_type: 'all',
    data_type_id: 'all',
    keyword: 'all',
    topic: 'all',
    publisher: 'all',
    project: 'all'
  })
  const [options, setOptions] = useState({
    country: [],
    spatial_representation_type: [],
    data_type: [],
    keyword: [],
    topic: [],
    publisher: [],
    project: []
  })
  const [results, setResults] = useState([])
  const [totalResults, setTotalResults] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedPolygon, setSelectedPolygon] = useState(null)
  const [mapCenter, setMapCenter] = useState(null)
  const [mapZoom, setMapZoom] = useState(4)
  const [titleSuggestions, setTitleSuggestions] = useState([])
  const [titleSearchLoading, setTitleSearchLoading] = useState(false)
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [showSearchForm, setShowSearchForm] = useState(true)
  const [showMap, setShowMap] = useState(true)
  const [selectedItems, setSelectedItems] = useState([]) // [{id, title}]
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  const [activeEllipsis, setActiveEllipsis] = useState(null) // {pos: 'top'|'bottom', idx}
  const [ellipsisValue, setEllipsisValue] = useState('')
  const [ellipsisInvalid, setEllipsisInvalid] = useState(false)
  const [bboxFilteredIds, setBboxFilteredIds] = useState(null) // null | number[]
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const titleDebounceRef = useRef(null)

  const boxesSource = results

  const allResultBoxes = React.useMemo(() => {
    const toNum = (v) => {
      const n = typeof v === 'number' ? v : parseFloat(v)
      return Number.isFinite(n) ? n : NaN
    }

    return (boxesSource || [])
      .map((item) => {
        const west = toNum(item?.west_bounding_longitude)
        const east = toNum(item?.east_bounding_longitude)
        const south = toNum(item?.south_bounding_latitude)
        const north = toNum(item?.north_bounding_latitude)
        const valid = [west, east, south, north].every(Number.isFinite)
        if (!valid) return null

        return {
          id: item?.id,
          title: item?.title,
          bounds: [
            [south, west],
            [north, east]
          ]
        }
      })
      .filter(Boolean)
  }, [boxesSource])

  const drawResultBoxes = React.useMemo(() => {
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
    const normLng = (lng) => {
      const x = ((lng + 180) % 360 + 360) % 360
      return x - 180
    }

    const out = []
    ;(allResultBoxes || []).forEach((b) => {
      if (!b?.id || !b?.bounds || b.bounds.length !== 2) return
      const [[southRaw, westRaw], [northRaw, eastRaw]] = b.bounds
      const south = clamp(southRaw, -90, 90)
      const north = clamp(northRaw, -90, 90)

      let west = normLng(westRaw)
      let east = normLng(eastRaw)

      // Some sources encode Pacific bboxes in a way that yields a very wide span
      // (e.g. west=-170, east=170). In those cases, the intended bbox is usually
      // the *short* span across the dateline, so treat it as antimeridian-crossing.
      const span = east - west
      if (Number.isFinite(span) && span > 180) {
        const tmp = west
        west = east
        east = tmp
      }

      if (west > east) {
        out.push({ ...b, bounds: [[south, west], [north, 180]] })
        out.push({ ...b, bounds: [[south, -180], [north, east]] })
      } else {
        out.push({ ...b, bounds: [[south, west], [north, east]] })
      }
    })
    return out
  }, [allResultBoxes])

  const displayResults = React.useMemo(() => {
    if (!bboxFilteredIds || bboxFilteredIds.length === 0) return results
    const set = new Set(bboxFilteredIds)
    return (results || []).filter(r => set.has(r.id))
  }, [results, bboxFilteredIds])

  // Keep all bounding boxes on the map at all times; filtering affects only the results list.
  const resultBoxes = drawResultBoxes

  const boundsOverlap = (a, b) => {
    if (!a || !b || a.length !== 2 || b.length !== 2) return false
    const [aSW, aNE] = a
    const [bSW, bNE] = b
    const aSouth = aSW[0], aWest = aSW[1], aNorth = aNE[0], aEast = aNE[1]
    const bSouth = bSW[0], bWest = bSW[1], bNorth = bNE[0], bEast = bNE[1]
    return aWest <= bEast && aEast >= bWest && aSouth <= bNorth && aNorth >= bSouth
  }

  const handleResultBoxClick = (box, latlng) => {
    if (!box?.id) return

    if (latlng && Number.isFinite(latlng.lat) && Number.isFinite(latlng.lng)) {
      const lat = latlng.lat
      const lng = (((latlng.lng + 180) % 360 + 360) % 360) - 180
      const containsPoint = (bounds) => {
        if (!bounds || bounds.length !== 2) return false
        const [[south, west], [north, east]] = bounds
        return lat >= south && lat <= north && lng >= west && lng <= east
      }

      const ids = Array.from(new Set(
        (drawResultBoxes || [])
          .filter(b => b?.id && containsPoint(b.bounds))
          .map(b => b.id)
      ))

      setBboxFilteredIds(ids.length > 0 ? ids : [box.id])
    } else {
      const overlapping = (allResultBoxes || [])
        .filter(b => b?.id && b?.bounds && box?.bounds && boundsOverlap(b.bounds, box.bounds))
        .map(b => b.id)
      setBboxFilteredIds(overlapping.length > 0 ? overlapping : [box.id])
    }

    const header = document.getElementById('search-results')
    if (header && typeof header.scrollIntoView === 'function') {
      header.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handlePolygonClick = (polygonCoords) => {
    if (!polygonCoords || !Array.isArray(polygonCoords) || polygonCoords.length < 3) return

    const lngs = polygonCoords
      .map(c => c?.[0])
      .filter(v => typeof v === 'number' && Number.isFinite(v))
    const lats = polygonCoords
      .map(c => c?.[1])
      .filter(v => typeof v === 'number' && Number.isFinite(v))

    if (lngs.length === 0 || lats.length === 0) return

    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    const polygonBounds = [
      [minLat, minLng],
      [maxLat, maxLng]
    ]

    const overlapping = (allResultBoxes || [])
      .filter(b => b?.id && b?.bounds && boundsOverlap(b.bounds, polygonBounds))
      .map(b => b.id)

    setBboxFilteredIds(overlapping)
  }


  const handlePageSizeChange = async (newSize) => {
    // reset to first page when page size changes
    setPageSize(newSize)
    setPage(0)
    await fetchPage(0, newSize)
  }

  // compute page numbers to show in pagination (with ellipsis)
  const getPageNumbers = () => {
    const totalPages = Math.ceil((totalResults || 0) / pageSize)
    const maxButtons = 7 // adjust how many buttons to show
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i)

    const pages = []
    // always show first, last, current +/- 1
    pages.push(0)
    let start = Math.max(1, page - 1)
    let end = Math.min(totalPages - 2, page + 1)

    if (start > 1) pages.push('...')
    for (let p = start; p <= end; p++) pages.push(p)
    if (end < totalPages - 2) pages.push('...')
    pages.push(totalPages - 1)
    return pages
  }

  const handleEllipsisGo = async () => {
    const p = parseInt(ellipsisValue, 10)
    const totalPages = Math.max(1, Math.ceil((totalResults || 0) / pageSize))
    if (Number.isNaN(p) || p < 1 || p > totalPages) {
      // mark invalid and show visual feedback
      setEllipsisInvalid(true)
      // show a toast with helpful message if toast is available
      try {
        // lazy import to avoid top-level import if not present in some contexts
        const { toast } = await import('sonner')
        toast.error(`Invalid page number. Max page is ${totalPages}`)
      } catch {
        // ignore if toast cannot be imported
      }
      return
    }
    const newPage = Math.max(0, p - 1)
    await fetchPage(newPage)
    setEllipsisValue('')
    setActiveEllipsis(null)
    setEllipsisInvalid(false)
  }

  // Fetch filter options from elasticsearch on mount
  useEffect(() => {
    async function fetchOptions() {
      try {
        const [country, spatialRepresentationType, dataTypeRaw, keyword, topic, publisher, project] =
          await Promise.all([
            elasticsearchService.getFilterOptions('country'),
            elasticsearchService.getFilterOptions('spatial_representation_type'),
            elasticsearchService.getFilterOptions('datatype'),
            elasticsearchService.getFilterOptions('keyword'),
            elasticsearchService.getFilterOptions('topic'),
            elasticsearchService.getFilterOptions('publisher'),
            elasticsearchService.getFilterOptions('project'),
          ])
        const dataTypes = (Array.isArray(dataTypeRaw) ? dataTypeRaw : []).map((v) => ({
          value: v,
          label: v
        })).filter((d) => d.value && d.label)
        setOptions({
          country: country || [],
          spatial_representation_type: spatialRepresentationType || [],
          data_type: dataTypes,
          keyword: keyword || [],
          topic: topic || [],
          publisher: publisher || [],
          project: project || []
        })
      } catch (error) {
        console.error('Failed to load filter options:', error)
        setError('Failed to load filter options')
      }
    }
    fetchOptions()
  }, [])

  // Handle search parameter from URL (e.g., from notifications)
  useEffect(() => {
    const searchTerm = searchParams.get('search')
    if (searchTerm) {
      setFilters(prev => ({ ...prev, title: searchTerm }))
      // We need to wait for filters to be set, or just use the searchTerm directly
      const performAutoSearch = async () => {
        setLoading(true)
        try {
          // Note: for auto-search from notification, we relax the country/polygon requirement
          const sf = {
            title: searchTerm,
            page: 0,
            size: pageSize
          }
          const r = await elasticsearchService.searchMetadataWithFilters(sf)
          setResults(r.data || [])
          setTotalResults(r.total || 0)
          setPage(0)
          if (r.data && r.data.length > 0) {
            setShowSearchForm(false)
            setShowMap(false)
          }
        } catch (error) {
          console.error('Auto-search error:', error)
        } finally {
          setLoading(false)
        }
      }
      performAutoSearch()
    }
  }, [searchParams])

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))

    // If country changes, clear search results + map bboxes immediately
    if (key === 'country') {
      setResults([])
      setTotalResults(0)
      setPage(0)
      setBboxFilteredIds(null)
    }

    // If title is changed, search for suggestions (debounced)
    if (key === 'title' && value && value.length > 2) {
      setShowTitleSuggestions(true)
      setSelectedSuggestionIndex(-1)
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
      titleDebounceRef.current = setTimeout(() => searchTitleSuggestions(value), 300)
    } else if (key === 'title') {
      setTitleSuggestions([])
      setShowTitleSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }

    // If country is selected, zoom map to that country
    if (key === 'country' && value && value !== '' && value !== 'All Countries') {
      const countryCoords = getCountryCenter(value)
      if (countryCoords) {
        setMapCenter({ lat: countryCoords.lat, lng: countryCoords.lng })
        setMapZoom(countryCoords.zoom)
      }
    } else if (key === 'country' && value === 'All Countries') {
      // Reset map to default view when "All Countries" is selected
      setMapCenter(null)
      setMapZoom(4)
    }
  }

  // Search for title suggestions from Elasticsearch
  const searchTitleSuggestions = async (searchTerm) => {
    if (searchTerm.length < 3) return

    setTitleSearchLoading(true)
    try {
      // Fetch a small number of suggestions — only need enough to display the dropdown
      const searchFilters = { title: searchTerm, size: 10 }
      const res = await elasticsearchService.searchMetadataWithFilters(searchFilters)
      const suggestions = res.data || []
      setTitleSuggestions(suggestions)
    } catch (error) {
      console.error('Failed to fetch title suggestions:', error)
      setTitleSuggestions([])
    } finally {
      setTitleSearchLoading(false)
    }
  }

  // Handle keyboard navigation for title suggestions
  const handleTitleKeyDown = (e) => {
    if (!showTitleSuggestions || titleSuggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const newDownIndex = selectedSuggestionIndex < titleSuggestions.length - 1 ? selectedSuggestionIndex + 1 : selectedSuggestionIndex
        setSelectedSuggestionIndex(newDownIndex)
        scrollToSuggestion(newDownIndex)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const newUpIndex = selectedSuggestionIndex > 0 ? selectedSuggestionIndex - 1 : -1
        setSelectedSuggestionIndex(newUpIndex)
        if (newUpIndex >= 0) {
          scrollToSuggestion(newUpIndex)
        }
        break
      }
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < titleSuggestions.length) {
          const selectedItem = titleSuggestions[selectedSuggestionIndex]
          handleFilterChange('title', selectedItem.title)
          setShowTitleSuggestions(false)
          setSelectedSuggestionIndex(-1)
        }
        break
      case 'Escape':
        setShowTitleSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  // Scroll to keep the selected suggestion visible
  const scrollToSuggestion = (index) => {
    if (index < 0) return

    const suggestionsContainer = document.querySelector('.title-suggestions-container')
    if (!suggestionsContainer) return

    const suggestionElements = suggestionsContainer.querySelectorAll('.suggestion-item')
    if (index >= suggestionElements.length) return

    const targetElement = suggestionElements[index]
    if (targetElement) {
      targetElement.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }

  // Handle suggestion selection
  const handleSuggestionClick = (title) => {
    handleFilterChange('title', title)
    setShowTitleSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  // Handle input blur (lose focus)
  const handleTitleBlur = () => {
    // Delay hiding to allow click events to fire
    setTimeout(() => {
      setShowTitleSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }, 150)
  }

  // Handle polygon drawn on map
  const handlePolygonDrawn = (coordinates) => {
    setSelectedPolygon(coordinates)
  }

  // Build normalized search filters object for Elasticsearch calls
  const buildSearchFilters = (baseFilters, polygon, pageNum = 0, size = pageSize) => {
    const sf = Object.entries(baseFilters).reduce((acc, [key, value]) => {
      if (key === 'country' && value === 'All Countries') {
        acc[key] = ''
      } else {
        acc[key] = value === 'all' ? '' : value
      }
      return acc
    }, {})

    // Data type dropdown stores an ID, but Elasticsearch filtering is done using
    // the string value (properties.data_type_value). Translate ID -> value here.
    if (sf.data_type_id !== undefined && sf.data_type_id !== null) {
      const rawId = String(sf.data_type_id).trim()
      if (rawId === '' || rawId === 'all') {
        delete sf.data_type_id
      } else {
        const match = (options?.data_type || []).find((d) => String(d?.value ?? d?.id ?? '').trim() === rawId)
        const dtValue = String(match?.label ?? '').trim()
        if (dtValue) {
          sf.data_type_value = dtValue
          delete sf.data_type_id
        }
      }
    }

    if (polygon && polygon.length > 0) {
      sf.polygon = polygon
      // If polygon is provided, make country optional
      if (!sf.country || sf.country.trim() === '') {
        delete sf.country
      }
    }

    sf.page = pageNum
    sf.size = size
    return sf
  }

  // Fetch a specific page of results (0-indexed).
  // Pass customPageSize when calling immediately after setPageSize (state may not have updated yet).
  const fetchPage = async (newPage, customPageSize) => {
    const effectivePageSize = customPageSize ?? pageSize
    setLoading(true)
    setError(null)
    try {
      const base = buildSearchFilters(filters, selectedPolygon, 0, effectivePageSize)
      delete base.page
      delete base.size

      const sf = { ...base, page: newPage, size: effectivePageSize }
      const r = await elasticsearchService.searchMetadataWithFilters(sf)
      setResults(r.data || [])
      setTotalResults(r.total || 0)
      setPage(newPage)
      setBboxFilteredIds(null)

      if (r.data && r.data.length === 0) {
        setError('No results found for your search criteria. Try adjusting your filters or drawing a different area on the map.')
      }
    } catch (error) {
      console.error('Search error:', error)
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Clear all filters
  const handleClearAll = () => {
    setFilters({
      title: '',
      country: 'All Countries',
      spatial_representation_type: 'all',
      data_type_id: 'all',
      keyword: 'all',
      topic: 'all',
      publisher: 'all',
      project: 'all'
    })
    setResults([])
    setError(null)
    setSelectedPolygon(null)
    // Reset map to default view
    setMapCenter(null)
    setMapZoom(4)
    // Restore the search form and map
    setShowSearchForm(true)
    setShowMap(true)
    setSelectedItems([])
    setBboxFilteredIds(null)
  }

  // Search metadata in elasticsearch
  const handleSearch = async () => {
    // Check if either country is selected OR polygon is drawn
    // "All Countries" is a valid selection, so we don't need to require a polygon
    if ((!filters.country || filters.country.trim() === '') && (!selectedPolygon || selectedPolygon.length === 0)) {
      setError('Please select a country OR draw a polygon on the map to search')
      return
    }

    // delegate to fetchPage(0) which will normalize filters and fetch
    await fetchPage(0)
  }

  return (
    <div className="w-full space-y-4">
      {/* <div className="flex justify-end">
        <GuidedTourButton />
      </div> */}
      {/* Main Grid Layout - Always show when explicitly shown, or when no results */}
      {(showSearchForm || showMap) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* Left Panel - Search Form */}
          {showSearchForm && (
            <div className="h-full">
              <Card className="w-full h-full flex flex-col">
                <CardHeader>
                  <CardTitle>Search for Metadata</CardTitle>
                  <CardDescription>
                    Search and filter metadata records from the database.
                  </CardDescription>
                </CardHeader>
                <TourStep
                  id="home-search-filters"
                  title="Set filters and search"
                  order={1}
                  position="right"
                  spotlight={false}
                  content={
                    <span>
                      Adjust these inputs, then click Search to run your query.
                    </span>
                  }
                >
                  <CardContent className="space-y-4 flex-1">

                    {/* Title Input - Full Width */}
                    <div className="w-full relative">
                      <label className="text-sm font-medium mb-1 block">Title</label>
                      <Input
                        placeholder="Enter title to search..."
                        value={filters.title}
                        onChange={e => handleFilterChange('title', e.target.value)}
                        onKeyDown={handleTitleKeyDown}
                        onBlur={handleTitleBlur}
                        id="es_title"
                        className="w-full"
                      />
                      {/* Title Suggestions from Elasticsearch */}
                      {showTitleSuggestions && filters.title && filters.title.length > 2 && (
                        <div className="title-suggestions-container absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                          {titleSearchLoading ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Searching titles...
                            </div>
                          ) : (
                            <>
                              {titleSuggestions.length > 0 ? (
                                titleSuggestions.slice(0, 8).map((item, index) => (
                                  <div
                                    key={index}
                                    className={`suggestion-item px-3 py-2 cursor-pointer text-sm border-b border-border last:border-b-0 transition-colors ${index === selectedSuggestionIndex
                                      ? 'bg-primary text-primary-foreground'
                                      : 'hover:bg-muted'
                                      }`}
                                    onClick={() => handleSuggestionClick(item.title)}
                                  >
                                    <div className="font-medium">{item.title}</div>
                                    <div className="text-xs opacity-80">{item.country} | {item.type}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  No matching titles found
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>


                    {/* First Row - Country, Data Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          Country {selectedPolygon && selectedPolygon.length > 0 ? '(Optional with polygon)' : <span className="text-red-500">*</span>}
                        </label>
                        <SearchableSelect
                          value={filters.country}
                          onValueChange={val => handleFilterChange('country', val)}
                          placeholder="Select Country"
                          options={['All Countries', ...options.country.filter(opt => opt)]}
                          contentClassName="z-[9999]"
                          id="es_country"
                          isRequired={!selectedPolygon || selectedPolygon.length === 0}
                          showGenericAllOption={false}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Data Type</label>
                        <SearchableSelect
                          value={filters.data_type_id}
                          onValueChange={val => handleFilterChange('data_type_id', val)}
                          placeholder="Data Type"
                          options={options.data_type.map(dt => ({ label: dt.label, value: dt.value }))}
                          id="es_data_type"
                          contentClassName="z-[9999]"
                          getOptionLabel={opt => opt.label}
                          getOptionValue={opt => opt.value}
                        />
                      </div>
                    </div>

                    {/* Second Row - Spatial Representation Type, Project, Topic */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          Spatial Representation Type
                        </label>
                        <SearchableSelect
                          value={filters.spatial_representation_type}
                          onValueChange={val => handleFilterChange('spatial_representation_type', val)}
                          placeholder="All"
                          options={options.spatial_representation_type.filter(opt => opt)}
                          id="es_spatial_representation_type"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Project</label>
                        <SearchableSelect
                          value={filters.project}
                          onValueChange={val => handleFilterChange('project', val)}
                          placeholder="Project"
                          options={options.project.filter(opt => opt)}
                          id="es_project"
                          contentClassName="z-[9999]"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Topic</label>
                        <SearchableSelect
                          value={filters.topic}
                          onValueChange={val => handleFilterChange('topic', val)}
                          placeholder="Topic"
                          options={options.topic.filter(opt => opt)}
                          id="es_topic"
                        />
                      </div>
                    </div>

                    {/* Publisher - hidden */}
                    {/* <div>
                      <label className="text-sm font-medium mb-1 block">Publisher</label>
                      <SearchableSelect
                        value={filters.publisher}
                        onValueChange={val => handleFilterChange('publisher', val)}
                        placeholder="Publisher"
                        options={options.publisher.filter(opt => opt)}
                        id="es_publisher"
                      />
                    </div> */}

                    {/* Show Points Here */}
                    {selectedPolygon && selectedPolygon.length > 0 && (
                      <div className="border border-border rounded-lg p-4 bg-card shadow-sm">
                        <div className="font-medium mb-3 text-sm text-foreground flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          Selected Polygon Points ({selectedPolygon.length} points)
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                          {selectedPolygon.map((coord, index) => (
                            <div key={index} className="text-xs text-muted-foreground bg-muted/50 hover:bg-muted px-3 py-2 rounded-md border border-border transition-colors">
                              <span className="font-medium text-foreground">Point {index + 1}:</span> Lng: {coord[0].toFixed(4)}, Lat: {coord[1].toFixed(4)}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                          Coordinates will be included in your search (GeoJSON format: [Longitude, Latitude])
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <Button onClick={handleSearch} variant="default" className="flex-1 flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search
                      </Button>
                      <Button onClick={handleClearAll} variant="outline" className="flex items-center gap-2">
                        <X className="h-4 w-4" />
                        Clear All
                      </Button>
                    </div>

                    {/* Error Display */}
                    {error && (
                      <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                        {error}
                      </div>
                    )}
                  </CardContent>
                </TourStep>
              </Card>
            </div>
          )}

          {/* Right Panel - Map */}
          {showMap && (
            <div className="h-full">
              <Card className="w-full h-full flex flex-col overflow-hidden py-0 gap-0">
                <CardHeader className={`pt-4 pb-2 ${results.length > 0 ? 'py-2' : ''}`}>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Interactive Map
                    <span className="text-sm font-normal text-muted-foreground">
                      Draw polygons to filter by geographic extent
                    </span>
                    <div className="relative group">
                      <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                      <div className="absolute top-1/2 left-full transform -translate-y-1/2 ml-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[9999]">
                        <div className="font-medium mb-1">🗺️ Map Instructions:</div>
                        <div className="flex items-center gap-2">
                          <PenTool className="h-3 w-3 text-primary" />
                          <span>
                            Use the polygon tool on the right to draw

                          </span>
                        </div>
                        <div>• Click to add points for your polygon</div>
                        <div>• Double-click to finish the polygon</div>
                        <div>• Use edit tools to modify the shape</div>
                        <div>• Use delete tool to remove the shape</div>
                        <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900"></div>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pt-2 pb-0 flex-1 flex flex-col">
                  <TourStep
                    id="home-map-draw"
                    title="Draw a polygon"
                    order={2}
                    position="top"
                    className="flex-1"
                    content={
                      <div className="flex items-center gap-2">
                        <span>Use the polygon tool on the map to draw your area of interest.</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="60"
                          height="60"
                          viewBox="0 0 64 64"
                        >
                          <rect x="4" y="4" width="56" height="56" rx="6" ry="6" fill="white" stroke="#7da6af" strokeWidth="2" />
                          <polygon points="32,16 44,26 40,44 24,44 20,26" fill="#333" />
                        </svg>
                      </div>
                    }
                  >
                    <MapComponent
                      onPolygonDrawn={handlePolygonDrawn}
                      center={mapCenter}
                      zoom={mapZoom}
                      className="w-full h-full min-h-[320px]"
                      currentPolygon={selectedPolygon}
                      resultBoxes={resultBoxes}
                      onResultBoxClick={handleResultBoxClick}
                      onPolygonClick={handlePolygonClick}
                    />
                  </TourStep>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Results Section - Below the search form and map when they are shown */}
      {(results.length > 0 || loading) && (
        <Card className="w-full">
          <CardHeader id="search-results">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span>Search Results</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {loading
                    ? 'Searching...'
                    : (bboxFilteredIds && bboxFilteredIds.length > 0
                      ? `Showing ${displayResults.length} overlapping result(s) out of ${results.length}`
                      : (totalResults > 0
                        ? `Showing ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalResults)} of ${totalResults}`
                        : (results.length > 0 ? `Showing ${results.length} result(s)` : 'No results'))
                    )}
                </span>
              </div>
              {!loading && results.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {bboxFilteredIds && bboxFilteredIds.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => { setBboxFilteredIds(null) }}
                    >
                      Show All
                    </Button>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-sm">Per page:</label>
                    <select value={pageSize} onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))} className="text-sm border border-border rounded px-2 py-1 bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((p, idx) => (
                      p === '...' ? (
                        activeEllipsis && activeEllipsis.pos === 'top' && activeEllipsis.idx === idx ? (
                          <span key={`dots-input-${idx}`} className="flex items-center gap-1">
                            <input
                              value={ellipsisValue}
                              onChange={(e) => { setEllipsisValue(e.target.value); if (ellipsisInvalid) setEllipsisInvalid(false); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleEllipsisGo() }}
                              className={`text-sm rounded px-2 py-1 w-20 bg-card text-foreground focus:outline-none ${ellipsisInvalid ? 'border-2 border-destructive' : 'border border-border'}`}
                              placeholder="page #"
                              aria-invalid={ellipsisInvalid}
                            />
                            <Button size="sm" onClick={() => handleEllipsisGo('top')} className="text-xs">Go</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setActiveEllipsis(null); setEllipsisInvalid(false); setEllipsisValue('') }} className="text-xs">×</Button>
                          </span>
                        ) : (
                          <button key={`dots-${idx}`} className="px-2 text-sm" onClick={() => setActiveEllipsis({ pos: 'top', idx })}>...</button>
                        )
                      ) : (
                        <Button key={`pg-${p}`} size="sm" variant={p === page ? 'default' : 'outline'} onClick={() => fetchPage(p)} className="text-xs">{p + 1}</Button>
                      )
                    ))}
                  </div>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Searching...</span>
              </div>
            )}
            {!loading && results.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                  {displayResults.map(item => {
                    const checked = selectedItems.some(si => si.id === item.id)
                    return (
                      <Card
                        key={item.id}
                        id={`result-${item.id}`}
                        className="border hover:shadow-md transition-shadow hover:bg-muted/50"
                      >
                        <CardContent className="p-2 flex flex-row gap-3 h-full">
                          {/* Map Thumbnail - Left Side */}
                          <div className="flex-shrink-0 w-32" id="metaThumbnail">
                            <MetadataMapThumbnail metadata={item} />
                          </div>

                          {/* Content - Right Side */}
                          <div className="flex-1 flex flex-col min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="font-semibold text-sm line-clamp-2">{item.title}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              {item.country && item.country !== 'Unknown' && (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm ${getBadgeColor(item.country)}`}>
                                  {item.country}
                                </span>
                              )}
                              {item.topic && item.topic !== 'Unknown' && (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm ${getBadgeColor(item.topic)}`}>
                                  {item.topic}
                                </span>
                              )}
                            </div>
                            {/* <div className="text-xs line-clamp-2 mb-2">{item.abstract}</div> */}
                            
                            {/* Keywords Hashtags */}
                            {item.keyword && item.keyword !== 'Unknown' && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {(Array.isArray(item.keyword) ? item.keyword : String(item.keyword).split(','))
                                  .map(kw => kw.trim())
                                  .filter(kw => kw.length > 0)
                                  .slice(0, 5)
                                  .map((kw, i) => (
                                  <span key={i} className="text-[10px] text-muted-foreground">
                                    #{kw}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex justify-end items-center gap-2 mt-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(`${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID(item.id, item.metadataType?.toLowerCase() || API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION)}`, '_blank')}
                                className="text-xs"
                              >
                                View Details
                              </Button>
                              <div onClick={(e) => e.stopPropagation()}>
                                <RequestDataButton
                                  metadataId={item.id}
                                  title={`Request Access: ${item.title}`}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalResults)} of {totalResults}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 ml-3">
                      <label className="text-sm">Per page:</label>
                      <select value={pageSize} onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))} className="text-sm border border-border rounded px-2 py-1 bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      {getPageNumbers().map((p, idx) => (
                        p === '...' ? (
                          activeEllipsis && activeEllipsis.pos === 'bottom' && activeEllipsis.idx === idx ? (
                            <span key={`dots-input-b-${idx}`} className="flex items-center gap-1">
                              <input
                                value={ellipsisValue}
                                onChange={(e) => { setEllipsisValue(e.target.value); if (ellipsisInvalid) setEllipsisInvalid(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleEllipsisGo() }}
                                className={`text-sm rounded px-2 py-1 w-20 bg-card text-foreground focus:outline-none ${ellipsisInvalid ? 'border-2 border-destructive' : 'border border-border'}`}
                                placeholder="page #"
                                aria-invalid={ellipsisInvalid}
                              />
                              <Button size="sm" onClick={() => handleEllipsisGo('bottom')} className="text-xs">Go</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setActiveEllipsis(null); setEllipsisInvalid(false); setEllipsisValue('') }} className="text-xs">×</Button>
                            </span>
                          ) : (
                            <button key={`dots-b-${idx}`} className="px-2 text-sm" onClick={() => setActiveEllipsis({ pos: 'bottom', idx })}>...</button>
                          )
                        ) : (
                          <Button key={`pgb-${p}`} size="sm" variant={p === page ? 'default' : 'outline'} onClick={() => fetchPage(p)} className="text-xs">{p + 1}</Button>
                        )
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {!loading && results.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No results found. Try adjusting your search criteria.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default HomeSearchMetaData
