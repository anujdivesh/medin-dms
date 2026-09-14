import React, { useEffect, useState } from 'react'
import { TourStep } from '@/components/guided-tour'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Loader2, Database, BarChart3, PieChart, TrendingUp, ChevronLeft, ChevronRight, Maximize2, BarChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { ExpandableModal } from '@/components/ui/expandable-modal'
import { PieChartComponent, BarChartComponent, LineChartComponent, AreaChartComponent, RadarChartComponent } from '@/components/ui/charts'
import { elasticsearchService } from '@/lib/elasticsearchService'
import { API_ENDPOINTS } from '@/config/apiEndpoints'

function HomeMetaDataStatus({
  metadata,
  statistics,
  loading,
  error,
  currentPage,
  totalRecords,
  itemsPerPage,
  startRecord,
  endRecord,
  columns,
  handlePageChange
}) {
  const totalPages = Math.ceil(totalRecords / itemsPerPage)

  // Normalize stats: trim, lowercase, map unknown variants, and aggregate duplicate keys
  const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return str
    return str
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  const normalizeStats = (arr) => {
    if (!Array.isArray(arr)) return []
    const aggregated = new Map()
    for (const item of arr) {
      const rawName = item?.name
      let key = (rawName === null || rawName === undefined)
        ? 'unknown'
        : String(rawName).trim().toLowerCase()
      // Map common placeholders/misspellings to 'unknown'
      if (key === '' || key === 'unkown' || key === 'n/a' || key === 'na' || key === 'none' || key === 'null' || key === 'undefined') {
        key = 'unknown'
      }
      const valueNum = typeof item?.value === 'number' ? item.value : Number(item?.value) || 0
      aggregated.set(key, (aggregated.get(key) || 0) + valueNum)
    }
    return Array.from(aggregated.entries()).map(([name, value]) => ({ name: toTitleCase(name), value }))
  }

  // const spatialRepresentationTypeStats = normalizeStats(statistics?.dataTypeStats || [])
  const countryStats = normalizeStats(statistics?.countryStats || [])
  const topicStats = normalizeStats(statistics?.topicStats || [])
  const temporalStats = normalizeStats(statistics?.temporalStats || [])
  const palette = ["#0088FE","#00C49F","#FFBB28","#FF8042","#8884D8","#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#22c55e","#06b6d4","#f43f5e","#84cc16"]

  // Fetch up to 1000 records for charts (independent of table pagination)
  const [chartMetadata, setChartMetadata] = useState([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await elasticsearchService.searchMetadata(1000, 0)
        if (!cancelled) setChartMetadata(res?.data || [])
      } catch {
        // fail silently for charts; table still shows
        if (!cancelled) setChartMetadata([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  

  // Note: Do not early-return on loading to avoid scroll jump; show inline cues instead

  /* Data completeness (currently disabled with the chart)
  const completenessFieldKeys = [
    'title','abstract','comment','temporal_coverage_from','temporal_coverage_to','language','version','project_name','project_code','west_bounding_longitude','east_bounding_longitude','south_bounding_latitude','north_bounding_latitude','spatial_representation_type_value','crs_value','crs_description','contact_first_name','contact_last_name','contact_position','contact_email','publisher_value','publisher_website','publisher_email','topic_value','keyword_value','country_short_name','country_long_name','access_constraints','link_to_data','license','acknowledgement','history','fundings','references_','created_by','created_at','updated_at','status'
  ]
  const computeMissingPercent = (field) => {
    if (!Array.isArray(metadata) || metadata.length === 0) return 0
    const unknownSet = new Set(['', 'unknown', 'unkown', 'n/a', 'na', 'none', 'null', 'undefined'])
    const isMissingValue = (val) => {
      if (val === null || val === undefined) return true
      if (typeof val === 'string') {
        const s = val.trim().toLowerCase()
        return unknownSet.has(s)
      }
      if (Array.isArray(val)) {
        if (val.length === 0) return true
        return val.every((v) => {
          if (v === null || v === undefined) return true
          if (typeof v === 'string') {
            const s = v.trim().toLowerCase()
            return unknownSet.has(s)
          }
          return false
        })
      }
      return false
    }
    let missing = 0
    for (const item of metadata) {
      const v = item[field]
      missing += isMissingValue(v) ? 1 : 0
    }
    return Math.round((missing / metadata.length) * 100)
  }
  const completenessStats = completenessFieldKeys
    .map((key) => ({ name: toTitleCase(key.replace(/_/g, ' ')), value: computeMissingPercent(key) }))
    .sort((a, b) => b.value - a.value)
  */

  // Radar completeness for selected fields (0-100% missing)
  const radarFields = [
    'title',
    'abstract',
    'comment',
    'project_name',
    'spatial_representation_type_value',
    'contact_email',
    'publisher_email',
    'topic_value',
    'keyword_value',
    'country_long_name',
    'link_to_data',
  ]
  const unknownSet = new Set(['', 'unknown', 'unkown', 'n/a', 'na', 'none', 'null', 'undefined'])
  const isMissingGeneric = (val) => {
    if (val === null || val === undefined) return true
    if (typeof val === 'string') return unknownSet.has(val.trim().toLowerCase())
    if (Array.isArray(val)) return val.length === 0
    return false
  }
  const getFieldValue = (item, field) => {
    if (item && Object.prototype.hasOwnProperty.call(item, field)) return item[field]
    const props = item?.rawData?.properties
    if (props && Object.prototype.hasOwnProperty.call(props, field)) return props[field]
    return undefined
  }
  const computeMissingPercentWithRule = (field) => {
    const dataset = Array.isArray(chartMetadata) && chartMetadata.length > 0 ? chartMetadata : metadata
    if (!Array.isArray(dataset) || dataset.length === 0) return 0
    let missing = 0
    for (const item of dataset) {
      if (field === 'link_to_data') {
        const access = (getFieldValue(item, 'access_constraints') || '').toString().trim().toLowerCase()
        const isPrivate = access === 'private'
        const linkVal = getFieldValue(item, 'link_to_data')
        if (isPrivate) {
          // Do not count missing link when private
          continue
        }
        if (isMissingGeneric(linkVal)) missing++
      } else {
        if (isMissingGeneric(getFieldValue(item, field))) missing++
      }
    }
    return Math.round((missing / dataset.length) * 100)
  }
  const radarCompleteness = radarFields.map((f) => ({
    label: toTitleCase(f.replace(/_/g, ' ')),
    missing: computeMissingPercentWithRule(f),
  }))
  return (
    <>
      {loading && (
        <div className="w-full py-2 text-xs text-muted-foreground">Loading page...</div>
      )}
      {error && (
        <div className="w-full mb-2 text-xs text-destructive">{error}</div>
      )}
      {/* Charts Section */}
      {statistics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <ExpandableModal
            trigger={
              <Card className="h-full w-full group cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Data Completeness (Radar)
                    <Maximize2 className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Missing percentage across key fields (lower is better)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadarChartComponent
                    data={radarCompleteness}
                    title=""
                    angleKey="label"
                    radiusKey="missing"
                    color="#3b82f6"
                    height={300}
                  />
                </CardContent>
              </Card>
            }
            title="Data Completeness (Radar)"
            description="Missing percentage across key fields (lower is better)"
            size="full"
          >
            <div className="h-[calc(90vh-140px)]">
              <RadarChartComponent
                data={radarCompleteness}
                title=""
                angleKey="label"
                radiusKey="missing"
                color="#3b82f6"
                height={"calc(90vh - 140px)"}
                angleTickFontSize={8}
                radiusTickFontSize={8}
                angleTickMargin={2}
                outerRadius="66%"
              />
            </div>
          </ExpandableModal>
          <ExpandableModal
            trigger={
              <Card className="h-full w-full group cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Top Countries
                    <Maximize2 className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Countries with the most metadata records
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BarChartComponent
                    data={countryStats}
                    title=""
                    xKey="name"
                    yKey="value"
                    color="#00C49F"
                    colors={palette}
                    height={260}
                    xTickAngle={-45}
                    showCategoryLegend={true}
                  />
                </CardContent>
              </Card>
            }
            title="Top Countries"
            description="Detailed view of countries with the most metadata records"
            size="full"
          >
            <div className="h-[calc(90vh-140px)]">
              <BarChartComponent
                data={countryStats}
                title=""
                xKey="name"
                yKey="value"
                color="#00C49F"
                colors={palette}
                height={"calc(90vh - 140px)"}
                xTickAngle={-45}
                showCategoryLegend={true}
              />
            </div>
          </ExpandableModal>
          <ExpandableModal
            trigger={
              <Card className="h-full w-full group cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Topic Distribution
                    <Maximize2 className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Distribution of metadata by research topic
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BarChartComponent
                    data={topicStats}
                    title=""
                    xKey="name"
                    yKey="value"
                    color="#FFBB28"
                    colors={palette}
                    height={260}
                    xTickAngle={-45}
                    showCategoryLegend={true}
                  />
                </CardContent>
              </Card>
            }
            title="Topic Distribution"
            description="Detailed view of metadata distribution by research topic"
            size="full"
          >
            <div className="h-[calc(90vh-140px)]">
              <BarChartComponent
                data={topicStats}
                title=""
                xKey="name"
                yKey="value"
                color="#FFBB28"
                colors={palette}
                height={"calc(90vh - 140px)"}
                xTickAngle={-45}
                showCategoryLegend={true}
              />
            </div>
          </ExpandableModal>
          <ExpandableModal
            trigger={
              <Card className="h-full w-full group cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Temporal Distribution
                    <Maximize2 className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Metadata records by year
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AreaChartComponent
                    data={temporalStats}
                    title=""
                    xKey="name"
                    yKey="value"
                    color="#FF8042"
                    areaType="linear"
                    showSeriesLegend={true}
                    legendLabel="Records"
                  />
                </CardContent>
              </Card>
            }
            title="Temporal Distribution"
            description="Detailed view of metadata records over time"
            size="full"
          >
            <div className="h-[calc(90vh-140px)]">
              <AreaChartComponent
                data={temporalStats}
                title=""
                xKey="name"
                yKey="value"
                color="#FF8042"
                areaType="linear"
                height={"calc(90vh - 140px)"}
                showSeriesLegend={true}
                legendLabel="Records"
              />
            </div>
          </ExpandableModal>
          {/* Data Completeness card temporarily disabled
          <ExpandableModal>... (kept disabled)
          </ExpandableModal>
          */}
        </div>
      )}
      {/* Data Table with Pagination - First Card */}
      <TourStep
        id="home-metadata-records"
        title="Metadata Records"
        order={4}
        position="top"
        spotlight={false}
        content={<span>Browse records and use “View” to open the item in pygeoapi.</span>}
      >
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Metadata Records
          </CardTitle>
          <CardDescription>
            Browse and search through metadata records from Elasticsearch. Click on any row to view detailed information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 min-w-0">
            <div className="cursor-pointer overflow-x-auto">
              <DataTable
                data={metadata}
                columns={columns}
                itemsPerPage={itemsPerPage}
                showPagination={false}
                onRowClick={(item) => {
                  if (!item || !item.id) return
                  const collection = item.metadataType?.toLowerCase() || API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION
                  const url = `${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID(item.id, collection)}`
                  window.open(url, '_blank')
                }}
              />
            </div>
            {/* Custom Pagination Controls */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startRecord} to {endRecord} of {totalRecords} records
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); Promise.resolve().then(() => handlePageChange(currentPage - 1)) }}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center space-x-1" role="group" aria-label="Pagination">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // no-op if already on this page
                          if (pageNum === currentPage) return
                          Promise.resolve().then(() => handlePageChange(pageNum))
                        }}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); Promise.resolve().then(() => handlePageChange(currentPage + 1)) }}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </TourStep>
      {/* {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mt-6">
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalRecords}</div>
              <p className="text-xs text-muted-foreground">
                Metadata records in Elasticsearch
              </p>
            </CardContent>
          </Card>
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Spatial Representation Types</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.dataTypeStats.length}</div>
              <p className="text-xs text-muted-foreground">
                Different spatial representation types
              </p>
            </CardContent>
          </Card>
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Countries</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.countryStats.length}</div>
              <p className="text-xs text-muted-foreground">
                Countries with data
              </p>
            </CardContent>
          </Card>
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Topics</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.topicStats.length}</div>
              <p className="text-xs text-muted-foreground">
                Research topics covered
              </p>
            </CardContent>
          </Card>
        </div>
      )} */}
      
     
    </>
  )
}

export default HomeMetaDataStatus
