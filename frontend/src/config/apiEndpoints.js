// Centralized API endpoints configuration
// This file contains all API endpoints used throughout the application

// Comma-separated Elasticsearch indices to search across - one per active
// MetadataType/ElasticsearchIndex in the backend (api/elasticsearch_sync.py).
// "lidar" holds all real data today; "oceanography" is included for forward
// compatibility even though it's currently empty. Update this list whenever
// a new metadata type/index is added in the backend admin.
const ES_INDICES = 'lidar,oceanography'

export const API_ENDPOINTS = {
  // Data Request endpoints
  DATA_REQUESTS: {
    BASE: '/data-requests',
    BY_ID: (id) => `/data-requests/${id}`,
    CREATE: '/data-requests',
    UPDATE: (id) => `/data-requests/${id}`,
  },

  // Elasticsearch endpoints
  ELASTICSEARCH: {
    BASE: import.meta.env.VITE_ES_BASE || '/dms/es',
    USERNAME: import.meta.env.VITE_ES_USERNAME || 'elastic',
    PASSWORD: import.meta.env.VITE_ES_PASSWORD || 'T2NlYW5wb3J0YWwyMDE3',
    METADATA_SEARCH: `/${ES_INDICES}/_search`,
    METADATA_SEARCH_WITH_SIZE: (size = 1000) => `/${ES_INDICES}/_search?size=${size}`,
    METADATA_SEARCH_PAGINATED: (from = 0, size = 10) => `/${ES_INDICES}/_search?from=${from}&size=${size}`,
    // Filter aggregations for getting distinct values
    COUNTRIES_AGGREGATION: `/${ES_INDICES}/_search`,
  },

  // PyGeoAPI endpoints
  // One collection per MetadataType (see the migration plan, Phase 9) -
  // "lidar" is the default since that's the only type with real data
  // today; pass a record's own metadata_type_value (lowercased) once
  // the frontend has it available.
  PYGEOAPI: {
    BASE: import.meta.env.VITE_PYGEOAPI_BASE || '/dms/pygeoapi',
    COLLECTIONS: '/collections',
    DEFAULT_COLLECTION: 'lidar',
    METADATA_COLLECTION: (collection = 'lidar') => `/collections/${collection}`,
    METADATA_ITEMS: (collection = 'lidar') => `/collections/${collection}/items`,
    METADATA_ITEM_BY_ID: (id, collection = 'lidar') => `/collections/${collection}/items/${id}`,
  },
}
