import React, { useState, useEffect, useCallback } from 'react'
import HomeSearchMetaData from './HomeSearchMetaData'
import HomeMetaDataStatus from './HomeMetaDataStats'
import { elasticsearchService } from '@/lib/elasticsearchService'
import { API_ENDPOINTS } from '@/config/apiEndpoints'
import { DataTable } from '@/components/ui/data-table'
import { BarChartComponent, PieChartComponent, LineChartComponent } from '@/components/ui/charts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Database, BarChart3, PieChart, TrendingUp, ExternalLink, Maximize2, ChevronLeft, ChevronRight, Search, BarChart } from 'lucide-react'
import { ExpandableModal } from '@/components/ui/expandable-modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TourStep, useTour } from '@/components/guided-tour'

function Home() {
  const [metadata, setMetadata] = useState([])
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [itemsPerPage] = useState(10)
  const [activeTab, setActiveTab] = useState("search")
  // Disable vertical tabs on scroll
  // const [isScrolled, setIsScrolled] = useState(false)
  const { isActive, currentStepId } = useTour()

  // Table columns configuration
  const columns = [
    {
      key: 'id',
      label: 'ID',
      render: (value) => <Badge variant="secondary">{value}</Badge>
    },
    {
      key: 'title',
      label: 'Title',
      render: (value) => (
        <div className="max-w-[200px] truncate" title={value}>
          {value}
        </div>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (value) => (
        <Badge variant={value === 'raster' ? 'default' : 'outline'}>
          {value}
        </Badge>
      )
    },
    {
      key: 'country',
      label: 'Country',
      render: (value) => (
        <div className="max-w-[100px] truncate" title={value}>
          {value}
        </div>
      )
    },
    {
      key: 'topic',
      label: 'Topic',
      render: (value) => (
        <div className="max-w-[120px] truncate" title={value}>
          {value}
        </div>
      )
    },
    {
      key: 'publisher',
      label: 'Publisher',
      render: (value) => (
        <div className="max-w-[120px] truncate" title={value}>
          {value}
        </div>
      )
    },
    // {
    //   key: 'created',
    //   label: 'Created',
    //   render: (value) => (
    //     <span className="text-sm text-muted-foreground">
    //       {value}
    //     </span>
    //   )
    // },
    {
      key: 'actions',
      label: 'Actions',
      render: (value, item) => (
        <Button
          variant="outline"
          size="sm"
                      onClick={(e) => {
              e.stopPropagation()
              const collection = item.metadataType?.toLowerCase() || API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION
              window.open(`${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID(item.id, collection)}`, '_blank')
            }}
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          View
        </Button>
      )
    }
  ]

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Calculate from value for Elasticsearch pagination
      const from = (currentPage - 1) * itemsPerPage
      
      // Fetch metadata with pagination
      const metadataResponse = await elasticsearchService.searchMetadata(itemsPerPage, from)
      setMetadata(metadataResponse.data)
      setTotalRecords(metadataResponse.total)

      // Fetch statistics for charts (only on first load)
      if (currentPage === 1) {
        const statsResponse = await elasticsearchService.getMetadataStatistics()
        setStatistics(statsResponse)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentPage, itemsPerPage])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // When guided tour reaches the stats tab step, switch tabs programmatically
  useEffect(() => {
    if (isActive && currentStepId === 'home-stats-tab') {
      setActiveTab('stats')
    }
  }, [isActive, currentStepId])

  // Handle scroll detection for tab layout switching (disabled)
  // const handleScroll = (e) => {
  //   const scrollTop = e.currentTarget.scrollTop
  //   setIsScrolled(scrollTop > 50)
  // }

  // Also react to window scroll (disabled)
  // useEffect(() => {
  //   const onWindowScroll = () => {
  //     setIsScrolled(window.scrollY > 50)
  //   }
  //   window.addEventListener('scroll', onWindowScroll, { passive: true })
  //   onWindowScroll()
  //   return () => window.removeEventListener('scroll', onWindowScroll)
  // }, [])

  const handleRefresh = () => {
    setCurrentPage(1)
    fetchData()
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const startRecord = (currentPage - 1) * itemsPerPage + 1
  const endRecord = Math.min(currentPage * itemsPerPage, totalRecords)

  // Avoid early-return loaders to prevent layout re-mounts/jumps when paging back to page 1

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Data</h3>
          <p className="text-destructive/80 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    )
  }
  // element.style {
  //   position: relative;
  //   inset: 0px;
  //   z-index: 10;
  //   width: 88em;
  //   height: 51em;
  return (
    <div className="flex flex-col w-full h-full overflow-x-hidden">

      {/* Main Content - Fits in remaining space after sidebar and top bar */}
      <div className="flex-1 overflow-hidden w-full">
        <div className="h-full w-full">
                     {/* Tabbed Dashboard */}
  <Tabs value={activeTab} onValueChange={setActiveTab} className={`h-full w-full flex flex-col`}>

            {/* Horizontal tabs at top when not scrolled */}
            {/* Always show horizontal tabs */}
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0 relative z-10 bg-background border-b">
              <TabsTrigger value="search" className="flex items-center space-x-2 w-full">
                <Search className="h-4 w-4" />
                <span>Search for Metadata</span>
              </TabsTrigger>
              <TourStep
                id="home-stats-tab"
                title="View Metadata Stats"
                order={3}
                position="bottom"
                className="col-span-1 inline-block"
                content={<span>Explore charts: totals, type distribution, countries, publishers, and trends.</span>}
              >
                <TabsTrigger value="stats" className="flex items-center space-x-2 w-full" data-clickable="true">
                  <BarChart className="h-4 w-4" />
                  <span>Metadata Stats</span>
                </TabsTrigger>
              </TourStep>
            </TabsList>

            {/* Vertical tabs on left when scrolled */}
            {/* Vertical tabs on scroll disabled */}

            {/* Tab Content Container */}
            <div className="flex-1 overflow-hidden min-h-0">
              {/* Search for Metadata Tab */}
              <TabsContent 
                value="search" 
                className="h-full overflow-auto p-4 space-y-4 m-0"
              >
                <HomeSearchMetaData />
              </TabsContent>

              {/* Metadata Stats Tab */}
              <TabsContent 
                value="stats" 
                className="h-full overflow-auto p-4 space-y-4 m-0"
              >
                <HomeMetaDataStatus
                  metadata={metadata}
                  statistics={statistics}
                  loading={loading}
                  error={error}
                  currentPage={currentPage}
                  totalRecords={totalRecords}
                  itemsPerPage={itemsPerPage}
                  startRecord={startRecord}
                  endRecord={endRecord}
                  columns={columns}
                  handlePageChange={handlePageChange}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

export default Home 