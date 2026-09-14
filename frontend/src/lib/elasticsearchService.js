import { API_ENDPOINTS } from '@/config/apiEndpoints'

class ElasticsearchService {
  constructor() {
    this.baseURL = API_ENDPOINTS.ELASTICSEARCH.BASE
  }

  async searchMetadata(size = 10, from = 0, query = null) {
    try {
      const searchBody = {
        size: size,
        from: from,
        query: query || {
          match_all: {}
        }
      }
	  const auth = btoa(`${API_ENDPOINTS.ELASTICSEARCH.USERNAME}:${API_ENDPOINTS.ELASTICSEARCH.PASSWORD}`)
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.ELASTICSEARCH.METADATA_SEARCH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
		  'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(searchBody)
      })

      if (!response.ok) {
        throw new Error(`Elasticsearch request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return this.transformElasticsearchResponse(data)
    } catch (error) {
      console.error('Error fetching metadata from Elasticsearch:', error)

      // Check if it's a CORS error
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
        throw new Error(
          'CORS Error: Unable to connect to Elasticsearch. Please ensure:\n' +
          '1. Elasticsearch is running on http://localhost:9200\n' +
          '2. CORS is enabled in Elasticsearch configuration\n' +
          '3. Restart Elasticsearch after updating CORS settings'
        )
      }

      throw error
    }
  }

  transformElasticsearchResponse(response) {
    const hits = response.hits?.hits || []
    const total = response.hits?.total?.value || 0

    const transformedData = hits.map(hit => {
      const source = hit._source
      const properties = source.properties || {}

      return {
        id: source.id,
        title: properties.title || 'No Title',
        description: properties.description || 'No Description',
        abstract: properties.abstract || '',
        type: properties.spatial_representation_type || properties.type || properties.spatial_representation_type_value || 'Unknown',
        country: properties.country_long_name || properties.country_short_name || 'Unknown',
        topic: properties.topic_value || 'Unknown',
        keyword: properties.keywords || properties.keyword_value || 'Unknown',
        publisher: properties.publisher_value || 'Unknown',
        project: properties.project_name || 'Unknown',
        created: properties.created ? new Date(properties.created).toLocaleDateString() : 'Unknown',
        updated: properties.updated ? new Date(properties.updated).toLocaleDateString() : 'Unknown',
        temporalFrom: properties.temporal_coverage_from || 'Unknown',
        temporalTo: properties.temporal_coverage_to || 'Unknown',
        language: properties.language || 'Unknown',
        version: properties.version || 'Unknown',
        // Which pygeoapi collection this record belongs to - the shared
        // "metadata" ES index this query reads from predates metadata_type
        // and never populated this, so it's normally absent; callers should
        // fall back to API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION.
        metadataType: properties.metadata_type_value,
        // Bounding coordinates for map thumbnail
        west_bounding_longitude: properties.west_bounding_longitude,
        east_bounding_longitude: properties.east_bounding_longitude,
        south_bounding_latitude: properties.south_bounding_latitude,
        north_bounding_latitude: properties.north_bounding_latitude,
        // Raw data for charts
        rawData: source
      }
    })

    return {
      data: transformedData,
      total,
      took: response.took,
      timedOut: response.timed_out
    }
  }

  // Get statistics for charts
  async getMetadataStatistics() {
    try {
      const response = await this.searchMetadata(1000) // Get more data for statistics
      const data = response.data

      // Spatial representation type distribution
      const dataTypeStats = this.getDataTypeDistribution(data)

      // Country distribution
      const countryStats = this.getCountryDistribution(data)

      // Topic distribution
      const topicStats = this.getTopicDistribution(data)

      // Temporal distribution (by year)
      const temporalStats = this.getTemporalDistribution(data)

      return {
        dataTypeStats,
        countryStats,
        topicStats,
        temporalStats,
        totalRecords: response.total
      }
    } catch (error) {
      console.error('Error getting metadata statistics:', error)
      throw error
    }
  }

  // Fetch up to N raw records for retrieval-augmented chat
  async fetchRecordsForChat(limit = 1000) {
    const response = await this.searchMetadata(limit, 0)
    // return array of raw OpenSearch/ES sources if needed
    return response.data
  }

  getDataTypeDistribution(data) {
    const distribution = {}
    data.forEach(item => {
      const type = item.type
      distribution[type] = (distribution[type] || 0) + 1
    })

    return Object.entries(distribution).map(([name, value]) => ({ name, value }))
  }

  getCountryDistribution(data) {
    const distribution = {}
    data.forEach(item => {
      const country = item.country
      distribution[country] = (distribution[country] || 0) + 1
    })

    return Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10 countries
      .map(([name, value]) => ({ name, value }))
  }

  getTopicDistribution(data) {
    const distribution = {}
    data.forEach(item => {
      const topic = item.topic
      distribution[topic] = (distribution[topic] || 0) + 1
    })

    return Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) // Top 8 topics
      .map(([name, value]) => ({ name, value }))
  }

  getTemporalDistribution(data) {
    const distribution = {}
    data.forEach(item => {
      if (item.temporalFrom && item.temporalFrom !== 'Unknown') {
        const year = new Date(item.temporalFrom).getFullYear()
        distribution[year] = (distribution[year] || 0) + 1
      }
    })

    return Object.entries(distribution)
      .sort((a, b) => a[0] - b[0]) // Sort by year
      .map(([name, value]) => ({ name: name.toString(), value }))
  }

  async getFilterOptions(filterType) {
    try {
      let fieldName = ''

      switch (filterType) {
        case 'country':
          fieldName = 'properties.country_long_name.keyword'
          break
        case 'datatype':
          fieldName = 'properties.data_type_value.keyword'
          break
        case 'spatial_representation_type':
          fieldName = 'properties.spatial_representation_type.keyword'
          break
        case 'keyword':
          fieldName = 'properties.keywords.keyword'
          break
        case 'topic':
          fieldName = 'properties.topic_value.keyword'
          break
        case 'publisher':
          fieldName = 'properties.publisher_value.keyword'
          break
        case 'project':
          fieldName = 'properties.project_name.keyword'
          break
        default:
          throw new Error(`Unknown filter type: ${filterType}`)
      }

      const searchBody = {
        size: 0,
        aggs: {
          distinct_values_of_field: {
            terms: {
              field: fieldName,
              size: 10000
            }
          }
        }
      }
	  const auth = btoa(`${API_ENDPOINTS.ELASTICSEARCH.USERNAME}:${API_ENDPOINTS.ELASTICSEARCH.PASSWORD}`)
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.ELASTICSEARCH.COUNTRIES_AGGREGATION}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
		   'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(searchBody)
      })

      if (!response.ok) {
        throw new Error(`Elasticsearch aggregation request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const buckets = data.aggregations?.distinct_values_of_field?.buckets || []

      // Extract unique values from buckets, trim whitespace
      return buckets
        .map(bucket => (typeof bucket.key === 'string' ? bucket.key.trim() : bucket.key))
        .filter(key => key && key !== '')
    } catch (error) {
      console.error(`Error fetching ${filterType} options from Elasticsearch:`, error)
      throw error
    }
  }

  async searchMetadataWithFilters(filters) {
    try {
      const query = this.buildFilterQuery(filters)
      // console.log('Elasticsearch query:', JSON.stringify(query, null, 2))
      // default to 100 results; callers can pass a `size` on filters to override
      // also support pagination via `page` (0-indexed) or explicit `from`
      const size = (typeof filters.size === 'number' && filters.size > 0) ? filters.size : 100
      // prevent accidental huge requests; cap at 5000 (adjust if your cluster allows more)
      const cappedSize = Math.min(size, 5000)

      let from = 0
      if (typeof filters.from === 'number' && filters.from >= 0) {
        from = filters.from
      } else if (typeof filters.page === 'number' && filters.page >= 0) {
        from = filters.page * cappedSize
      }

      return await this.searchMetadata(cappedSize, from, query)
    } catch (error) {
      console.error('Error searching metadata with filters:', error)
      throw error
    }
  }

  buildFilterQuery(filters) {
    // Back-compat: some callers still send `datatype` but the canonical name is
    // `spatial_representation_type` (Elasticsearch field: properties.spatial_representation_type).
    const effectiveFilters = {
      ...filters,
      spatial_representation_type: (filters?.spatial_representation_type && filters.spatial_representation_type.trim() !== '')
        ? filters.spatial_representation_type
        : (filters?.datatype || '')
    }

    const mustClauses = []
    const filterClauses = []

    // Title search (match query for text fields)
    if (effectiveFilters.title && effectiveFilters.title.trim() !== '') {
      mustClauses.push({
        multi_match: {
          query: effectiveFilters.title,
          fields: ['properties.title', 'properties.abstract'],
          type: 'phrase_prefix'
        }
      })
    }

    // Exact match filters
    // Note: data_type filtering uses data_type_value (string) because many ES indexes
    // do not reliably contain data_type_id.
    const exactFields = {
      country: 'properties.country_long_name.keyword',
      spatial_representation_type: 'properties.spatial_representation_type.keyword',
      keyword: 'properties.keywords.keyword',
      topic: 'properties.topic_value.keyword',
      publisher: 'properties.publisher_value.keyword',
      project: 'properties.project_name.keyword'
    }

    Object.entries(exactFields).forEach(([filterKey, fieldName]) => {
      if (effectiveFilters[filterKey] && effectiveFilters[filterKey].trim() !== '') {
        const termValue = effectiveFilters[filterKey]
        mustClauses.push({
          term: {
            [fieldName]: termValue
          }
        })
      }
    })

    // Data type filter (string value)
    // Use match (not term) so we tolerate casing and trailing spaces in indexed values
    // like "Lidar ".
    if (effectiveFilters.data_type_value && String(effectiveFilters.data_type_value).trim() !== '') {
      const v = String(effectiveFilters.data_type_value).trim()
      mustClauses.push({
        match: {
          'properties.data_type_value': {
            query: v,
            operator: 'and'
          }
        }
      })
    }

    // Polygon bounding box filter
    // Note: Using bbox intersection instead of geo_shape because geometry field is not mapped as geo_shape type
    if (effectiveFilters.polygon && Array.isArray(effectiveFilters.polygon) && effectiveFilters.polygon.length > 0) {
      // Calculate bounding box from polygon coordinates
      const lngs = effectiveFilters.polygon.map(coord => coord[0])
      const lats = effectiveFilters.polygon.map(coord => coord[1])

      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)

      // Bounding box intersection query - checks if metadata bbox intersects with drawn polygon bbox
      filterClauses.push({
        bool: {
          must: [
            // Metadata's west is less than or equal to polygon's east
            { range: { "properties.west_bounding_longitude": { lte: maxLng } } },
            // Metadata's east is greater than or equal to polygon's west
            { range: { "properties.east_bounding_longitude": { gte: minLng } } },
            // Metadata's south is less than or equal to polygon's north
            { range: { "properties.south_bounding_latitude": { lte: maxLat } } },
            // Metadata's north is greater than or equal to polygon's south
            { range: { "properties.north_bounding_latitude": { gte: minLat } } }
          ]
        }
      })
    }

    // If no filters, return match_all query
    if (mustClauses.length === 0 && filterClauses.length === 0) {
      return { match_all: {} }
    }

    const boolQuery = {
      bool: {}
    }

    if (mustClauses.length > 0) {
      boolQuery.bool.must = mustClauses
    }

    if (filterClauses.length > 0) {
      boolQuery.bool.filter = filterClauses
    }

    return boolQuery
  }
}

export const elasticsearchService = new ElasticsearchService()
